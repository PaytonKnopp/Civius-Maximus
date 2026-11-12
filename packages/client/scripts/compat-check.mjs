// What the game does when something it leans on is missing or goes away. One browser engine
// can't stand in for Safari or Firefox, but it can take things away from itself:
//
//   plain        nothing taken away (the baseline the others are compared with)
//   no-storage   localStorage and IndexedDB refuse everything (private modes, blocked cookies)
//   no-worker    no Web Workers (the AI then plays on the page)
//   bad-worker   Workers exist but fail to load (an old browser without module workers)
//   no-webgl     no WebGL at all (--disable-3d-apis)
//   lost-2d      the 2D map's WebGL context is lost and restored mid-game
//   lost-3d      the same for the 3D map
//
// For each: the game must open, play a turn (found a city, end the turn, see turn 2) and still
// be drawing at the end, with no error on the page. Screenshots go to <out-dir>.
//
//   pnpm build && pnpm --filter @cx/client exec vite preview --port 4173
//   node packages/client/scripts/compat-check.mjs <out-dir>
//
// Env: BASE_URL, ONLY (comma list of the names above).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const out = process.argv[2];
if (!out) throw new Error('Usage: compat-check.mjs <out-dir>');
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const only = process.env.ONLY?.split(',');

const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const CASES = [
  { name: 'plain', view: '2d' },
  {
    name: 'no-storage',
    view: '2d',
    init: () => {
      const refuse = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
      Object.defineProperty(window, 'localStorage', { get: refuse });
      Object.defineProperty(window, 'sessionStorage', { get: refuse });
      Object.defineProperty(window, 'indexedDB', { get: refuse });
    },
  },
  {
    name: 'no-worker',
    view: '2d',
    init: () => {
      delete window.Worker;
    },
  },
  {
    name: 'bad-worker',
    view: '2d',
    init: () => {
      const Real = window.Worker;
      // Loads nothing: the worker reports an error, as a browser without module workers does.
      window.Worker = function () {
        return new Real(URL.createObjectURL(new Blob(['throw new Error("no modules here")'])));
      };
    },
  },
  { name: 'no-webgl', view: '3d', args: ['--disable-3d-apis'] },
  { name: 'lost-2d', view: '2d', lose: true },
  { name: 'lost-3d', view: '3d', lose: true },
];

/** The share of the map canvas that isn't black or one flat color (a drawn map has detail). */
async function drawn(page) {
  const shot = await page.screenshot({ clip: { x: 200, y: 150, width: 800, height: 450 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 90;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 160, 90);
    const d = g.getImageData(0, 0, 160, 90).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4)
      seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    return seen.size;
  }, shot.toString('base64'));
}

const results = [];
for (const c of CASES) {
  if (only && !only.includes(c.name)) continue;
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ??
      (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined),
    args: c.args ?? GL,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  const r = { name: c.name, opened: false, turn: null, colors: 0, notes: [], errors };
  try {
    // Settings go in before the app reads them (where storage works at all).
    await page.addInitScript((view) => {
      try {
        localStorage.setItem('cx.hints.off', '1');
        localStorage.setItem('cx.settings', JSON.stringify({ view, quality: 'low' }));
      } catch {
        // The no-storage case: the game runs on its defaults.
      }
    }, c.view);
    if (c.init) await page.addInitScript(c.init);
    await page.goto(`${base}?debug#play`);
    await page.waitForSelector('.game', { timeout: 120_000 });
    r.opened = true;
    await page
      .waitForFunction(() => document.querySelector('.game')?.dataset.drawn === 'yes', null, {
        timeout: 90_000,
      })
      .catch(() => r.notes.push('no frame was drawn within 90 s'));
    // Close the leader's introduction if it's up, then play a turn through the game's own hook.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const played = await page.evaluate(async () => {
      const game = window.cx?.game;
      if (!game) return 'no debug hook';
      const me = game.humans()[0];
      const settler = Object.values(game.state.units).find(
        (u) => u.owner === me && u.type === 'unit_settler',
      );
      if (settler) game.act({ type: 'found_settlement', player: me, unit: settler.id });
      const r = game.act({ type: 'end_turn', player: me });
      if (!r.ok) return `end turn refused: ${r.error.message}`;
      const started = Date.now();
      while ((game.busy || game.state.turn < 2) && Date.now() - started < 120_000)
        await new Promise((res) => setTimeout(res, 200));
      return game.state.turn;
    });
    r.turn = played;
    if (c.lose) {
      const lost = await page.evaluate(async () => {
        const canvases = [...document.querySelectorAll('canvas')];
        let n = 0;
        for (const el of canvases) {
          const gl = el.getContext('webgl2') ?? el.getContext('webgl');
          const ext = gl?.getExtension('WEBGL_lose_context');
          if (!ext) continue;
          ext.loseContext();
          await new Promise((res) => setTimeout(res, 1500));
          ext.restoreContext();
          n++;
        }
        await new Promise((res) => setTimeout(res, 4000));
        return n;
      });
      r.notes.push(`${lost} WebGL context(s) lost and restored`);
      // Nudge the view so it has a reason to draw again.
      await page.mouse.move(640, 420);
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(2500);
    }
    await page.waitForTimeout(1500);
    r.colors = await drawn(page);
    r.notes.push(
      ...(await page.evaluate(() =>
        [...document.querySelectorAll('.notice, .online-bar, .mx-crash h2, .map-fallback')].map(
          (e) => e.textContent.trim().slice(0, 120),
        ),
      )),
    );
    await page.screenshot({ path: join(out, `${c.name}.png`) });
  } catch (e) {
    r.notes.push(`failed: ${String(e).slice(0, 200)}`);
    await page.screenshot({ path: join(out, `${c.name}.png`) }).catch(() => {});
  }
  results.push(r);
  await browser.close();
  console.log(
    `${r.name.padEnd(11)} opened ${r.opened ? 'yes' : 'NO '}  turn ${String(r.turn).padEnd(4)} map detail ${String(r.colors).padStart(4)}  ${r.errors.length} error(s)  ${r.notes.join(' | ')}`,
  );
  for (const e of r.errors.slice(0, 4)) console.log(`    ${e}`);
}

const bad = results.filter((r) => !r.opened || r.turn !== 2 || r.errors.length > 0);
console.log(
  bad.length ? `\n${bad.length} case(s) need a look` : '\nAll cases played a turn cleanly.',
);
process.exit(bad.length ? 1 : 0);
