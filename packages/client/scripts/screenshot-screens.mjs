// Every in-game screen from a real game, at every screen size: loads a save made with
// `pnpm cx profile ... --save <file>` (p1 becomes the human), then captures the map HUD, the city
// and unit cards, diplomacy, the game menu and every full screen, checking that each opens with
// its key, closes with Esc and fits the screen, with no console errors.
//
//   pnpm cx profile 8 150 1 standard continents --save /tmp/t150.json
//   node packages/client/scripts/screenshot-screens.mjs /tmp/t150.json <out-dir>
//
// Env: SIZES (comma list of fhd, mac, desk, short, tablet, phone, wide; default all),
// SCREENS (comma list of the names below; default all), VIEW (2d or 3d, default 2d: the 3D view
// is slow in a software renderer), LARGE=1 (Options' larger text), BASE_URL (a vite preview).
// Exits 1 on any problem.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [saveArg, out] = process.argv.slice(2);
if (!saveArg || !out) throw new Error('Usage: screenshot-screens.mjs <state.json> <out-dir>');
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const SIZES = {
  fhd: { width: 1920, height: 1080 },
  mac: { width: 1440, height: 900 },
  desk: { width: 1280, height: 800 },
  short: { width: 1280, height: 640 },
  tablet: { width: 820, height: 1100 },
  phone: { width: 390, height: 844 },
  wide: { width: 2560, height: 1440 },
};
const sizes = (process.env.SIZES ?? Object.keys(SIZES).join(',')).split(',');
const only = process.env.SCREENS?.split(',');
const want = (name) => !only || only.includes(name);
const view = process.env.VIEW ?? '2d';

// The save, wrapped the way the Load screen expects it, with p1 as the only human.
const state = JSON.parse(readFileSync(saveArg, 'utf8'));
for (const p of Object.values(state.players)) if (p.kind === 'human') p.kind = 'ai';
state.players.p1.kind = 'human';
const savePath = join(out, 'save.json');
writeFileSync(
  savePath,
  JSON.stringify({
    format: 'civius-maximus-save',
    version: 1,
    name: 'screens',
    savedAt: new Date().toISOString(),
    turn: state.turn,
    contentHash: state.contentHash,
    state,
  }),
);

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const problems = [];

/** Anything sticking out past the right edge that no scrolling box contains. */
const overflow = async (page, name) => {
  const bad = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const found = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= w + 1 || el.tagName === 'CANVAS') continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') continue;
      let held = false;
      for (let p = el.parentElement; p && !held; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        held =
          ['auto', 'scroll', 'hidden', 'clip'].includes(o) &&
          p.getBoundingClientRect().right <= w + 1;
      }
      if (!held) found.push(`${el.tagName}.${String(el.className).slice(0, 50)}`);
      if (found.length > 4) break;
    }
    return found;
  });
  if (bad.length) problems.push(`${name}: wider than the screen: ${bad.join(', ')}`);
};

const SCREENS = [
  ['tech', 't'],
  ['civics', 'c'],
  ['government', 'g'],
  ['governors', 'o'],
  ['greatpeople', 'p'],
  ['greatworks', 'k'],
  ['religion', 'r'],
  ['climate', 'x'],
  ['congress', 'u'],
  ['espionage', 'y'],
  ['citystates', 'i'],
  ['victories', 'v'],
  ['graphs', 'h'],
  ['ages', 'e'],
  ['help', '?'],
  ['pedia', 'F1'],
];

for (const size of sizes) {
  const viewport = SIZES[size];
  if (!viewport) throw new Error(`Unknown size ${size}`);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(
    ([v, large]) => {
      try {
        localStorage.setItem(
          'cx.settings',
          JSON.stringify({ view: v, showFps: true, largeText: large }),
        );
        localStorage.setItem('cx.hints.off', '1');
      } catch {
        // No storage: the defaults apply.
      }
    },
    [view, process.env.LARGE === '1'],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${size} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${size}: ${m.text()}`));
  await page.goto(`${base}?debug`, { waitUntil: 'networkidle' });
  await page.click('.home-entry:has-text("Load game")');
  await page.waitForSelector('.mx-saves');
  await page.setInputFiles('.mx-saves input[type=file]', savePath);
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForFunction(
    () => !/^0 fps/.test(document.querySelector('.fps')?.textContent ?? '0 fps'),
    null,
    { timeout: 90000 },
  );
  const intro = await page.$('.leader-intro .primary');
  if (intro) await intro.click();
  await page.waitForTimeout(view === '3d' ? 4000 : 1500);
  const shot = async (name) => {
    await page.screenshot({ path: `${out}/${size}-${name}.png` });
    await overflow(page, `${size}-${name}`);
  };
  if (want('hud')) await shot('hud');

  const ids = await page.evaluate(() => {
    const s = window.cx.game.state;
    const unit = Object.values(s.units).find((u) => u.owner === 'p1' && u.type !== 'unit_settler');
    return { capital: s.players.p1.capital, unit: unit?.id };
  });
  if (want('city') && ids.capital) {
    await page.evaluate((id) => window.cx.select('settlement', id), ids.capital);
    await page.waitForTimeout(700);
    await shot('city');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  if (want('unit') && ids.unit) {
    await page.evaluate((id) => window.cx.select('unit', id), ids.unit);
    await page.waitForTimeout(700);
    await shot('unit');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  if (want('diplomacy')) {
    const chips = await page.$$('.player-chip');
    if (chips[1]) {
      await chips[1].click();
      await page.waitForSelector('.player-panel');
      await page.waitForTimeout(600);
      await shot('diplomacy');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      if (await page.$('.player-panel')) problems.push(`${size}: diplomacy did not close with Esc`);
    }
  }
  if (want('menu')) {
    await page.click('.menu-button');
    await page.waitForTimeout(400);
    await shot('menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  for (const [name, key] of SCREENS) {
    if (!want(name)) continue;
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.keyboard.press(key);
    const opened = await page
      .waitForSelector('.screen, .mx', { timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    // Some screens only exist when their system is on (espionage, congress, climate).
    if (!opened) {
      console.log(`${size}: ${name} (${key}) is not in this game`);
      continue;
    }
    // Long enough for the screen's fade even in a software renderer at 2560 px.
    await page.waitForTimeout(viewport.width > 2000 ? 2500 : 800);
    await shot(name);
    await page.keyboard.press('Escape');
    await page
      .waitForSelector('.screen, .mx', { state: 'detached', timeout: 2500 })
      .catch(() => problems.push(`${size}: ${name} did not close with Esc`));
    await page.waitForTimeout(200);
  }
  console.log(`${size}: done`);
  await context.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'no problems');
process.exitCode = problems.length ? 1 : 0;
