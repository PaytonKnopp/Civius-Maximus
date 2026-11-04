// Measures how smoothly the map draws in a real browser, from saved games: an early one and a
// late one, in 3D and 2D. A game that is smooth early but not late shows up as a gap between the
// rows, whatever machine this runs on.
//
// Make the saves with the profiler (every seat there is an AI; this script turns p1 into the
// human so the game has a viewer):
//   pnpm cx profile 8 25  1 standard --save /tmp/early.json
//   pnpm cx profile 8 250 1 standard --save /tmp/late.json
// Then, with the client built and served (`pnpm build`, then vite preview on port 4173):
//   node packages/client/scripts/perf-lategame.mjs early=/tmp/early.json late=/tmp/late.json
//
// Env: BASE_URL, SECONDS (per measurement, default 6), QUALITY (low|medium|high, default
// medium), VIEWS (comma list of 3d,2d, default both), WIDTH/HEIGHT (default 1280x800).
// Headless Chromium here has no graphics card (software rendering), so the absolute frame times
// are pessimistic; compare rows with each other. Exits 1 if a late save is much slower than the
// early one (LATE_RATIO, default 2, on the mean frame time), so it can gate a release.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const saves = process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return i > 0 ? { name: a.slice(0, i), file: a.slice(i + 1) } : { name: a, file: a };
});
if (saves.length === 0) {
  console.error('Usage: perf-lategame.mjs early=/path/early.json late=/path/late.json');
  process.exit(2);
}
const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const seconds = Number(process.env.SECONDS ?? 6);
const quality = process.env.QUALITY ?? 'medium';
const views = (process.env.VIEWS ?? '3d,2d').split(',');
const viewport = {
  width: Number(process.env.WIDTH ?? 1280),
  height: Number(process.env.HEIGHT ?? 800),
};
const tmp = mkdtempSync(join(tmpdir(), 'cx-perf-'));

// A save file the Load screen accepts, with p1 as the human.
function saveFile({ name, file }) {
  const state = JSON.parse(readFileSync(file, 'utf8'));
  state.players.p1.kind = 'human';
  const path = join(tmp, `${name}.save.json`);
  writeFileSync(
    path,
    JSON.stringify({
      format: 'civius-maximus-save',
      version: 1,
      name,
      savedAt: new Date().toISOString(),
      turn: state.turn,
      contentHash: state.contentHash,
      state,
    }),
  );
  return { path, turn: state.turn };
}

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

// Counts frames and slow tasks in the page for a while, panning and zooming meanwhile.
async function measure(page) {
  await page.evaluate(() => {
    window.__perf = { frames: [], long: [], stop: false };
    let last = performance.now();
    const tick = (t) => {
      window.__perf.frames.push(t - last);
      last = t;
      if (!window.__perf.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__perf.long.push(e.duration);
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      // Long-task timing isn't available everywhere; frame times still are.
    }
  });
  const until = Date.now() + seconds * 1000;
  const { width, height } = viewport;
  let step = 0;
  while (Date.now() < until) {
    // Drag the map around, then zoom in and out.
    const dx = step % 2 === 0 ? -260 : 260;
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.down();
    await page.mouse.move(width / 2 + dx, height / 2 + (step % 3) * 40, { steps: 12 });
    await page.mouse.up();
    await page.mouse.wheel(0, step % 2 === 0 ? -300 : 300);
    await page.waitForTimeout(250);
    step++;
  }
  const raw = await page.evaluate(() => {
    window.__perf.stop = true;
    return window.__perf;
  });
  const frames = raw.frames.slice(5).sort((a, b) => a - b);
  const pct = (p) => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))] ?? 0;
  const mean = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
  return {
    frames: frames.length,
    meanMs: mean,
    p95Ms: pct(0.95),
    worstMs: frames[frames.length - 1] ?? 0,
    longTasks: raw.long.length,
    longTaskMs: raw.long.reduce((a, b) => a + b, 0),
  };
}

const results = [];
const errors = [];
for (const view of views) {
  for (const save of saves) {
    const { path, turn } = saveFile(save);
    const ctx = await browser.newContext({ viewport });
    await ctx.addInitScript(
      ([q, v]) => {
        try {
          localStorage.setItem(
            'cx.settings',
            JSON.stringify({ quality: q, view: v, showFps: true }),
          );
        } catch {
          // No storage: the defaults apply.
        }
      },
      [quality, view],
    );
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${save.name}/${view}: ${e.message}`));
    page.on(
      'console',
      (m) => m.type() === 'error' && errors.push(`${save.name}/${view}: ${m.text()}`),
    );
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.click('.home-entry:has-text("Load game")');
    await page.waitForSelector('.mx-saves');
    await page.setInputFiles('.mx-saves input[type=file]', path);
    await page.waitForSelector('canvas', { timeout: 60000 });
    await page.waitForFunction(
      () => !/^0 fps/.test(document.querySelector('.fps')?.textContent ?? '0 fps'),
      null,
      { timeout: 60000 },
    );
    // Close the leader introduction if the game opens with one.
    const intro = await page.$('.leader-intro .primary');
    if (intro) await intro.click();
    await page.waitForTimeout(1500);
    const r = await measure(page);
    results.push({ save: save.name, turn, view, ...r });
    await ctx.close();
  }
}
await browser.close();

console.log(`quality ${quality}, ${seconds}s per row, ${viewport.width}x${viewport.height}`);
console.log('save      turn  view  frames  mean(ms)  p95(ms)  worst(ms)  slow tasks  slow(ms)');
for (const r of results) {
  console.log(
    `${r.save.padEnd(8)} ${String(r.turn).padStart(5)}  ${r.view.padEnd(4)} ${String(r.frames).padStart(7)}  ${r.meanMs.toFixed(1).padStart(8)}  ${r.p95Ms.toFixed(1).padStart(7)}  ${r.worstMs.toFixed(0).padStart(9)}  ${String(r.longTasks).padStart(10)}  ${r.longTaskMs.toFixed(0).padStart(8)}`,
  );
}
if (errors.length) console.log(`console errors:\n${[...new Set(errors)].slice(0, 8).join('\n')}`);

// Gate: the last save against the first, per view.
const ratio = Number(process.env.LATE_RATIO ?? 2);
let failed = false;
if (saves.length >= 2) {
  for (const view of views) {
    const rows = results.filter((r) => r.view === view);
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (first && last && last.meanMs > first.meanMs * ratio) {
      console.log(
        `PROBLEM: ${view} frames take ${last.meanMs.toFixed(1)} ms on ${last.save} vs ${first.meanMs.toFixed(1)} ms on ${first.save} (limit ${ratio}x)`,
      );
      failed = true;
    }
  }
}
process.exit(failed || errors.length ? 1 : 0);
