// The whole game screen from a real save, for a release review: every part of the map HUD (top
// bar and its breakdowns, civ chips, trackers, lenses and their legends, the city card and each
// of its tabs, the unit card, the tile card, diplomacy and the deal screen, the game menu) and
// every full screen with each of its tabs, at every screen size. Each state is screenshotted and
// run through the DOM audit (scripts/audit.mjs): clipped text, raw ids, emoji, text off the
// screen, low contrast, small touch targets.
//
//   pnpm cx profile 8 150 1 standard continents --save /tmp/t150.json
//   node packages/client/scripts/review-screens.mjs /tmp/t150.json <out-dir>
//
// Env: SIZES (comma list of fhd, mac, desk, short, tablet, phone, wide; default all but wide),
// STEPS (comma list: hud, tips, city, unit, tile, lenses, diplomacy, menu, screens; default
// all), SCREENS (comma list of full screens, e.g. tech,government; default all), VIEW (2d or 3d; default 2d, the 3D view is slow in a software renderer), SEAT (whose
// eyes; default p1), LARGE=1 (Options' larger text), REDUCE=1 (reduced motion), HINTS=1 (leave
// the first-game hints on), TAG (a prefix for the file names, default the save's turn),
// BASE_URL (a vite preview).
// Writes <out-dir>/<tag>-<size>-<state>.png, <out-dir>/<tag>-findings.json and prints a summary.
// Exits 1 on a console error or a screen that doesn't open or close.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { auditPage, summarize } from './audit.mjs';

const [saveArg, out] = process.argv.slice(2);
if (!saveArg || !out) throw new Error('Usage: review-screens.mjs <state.json> <out-dir>');
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
const sizes = (process.env.SIZES ?? 'fhd,mac,desk,short,tablet,phone').split(',');
const steps = process.env.STEPS?.split(',');
const want = (name) => !steps || steps.includes(name);
const onlyScreens = process.env.SCREENS?.split(',');
const view = process.env.VIEW ?? '2d';
const seat = process.env.SEAT ?? 'p1';

const state = JSON.parse(readFileSync(saveArg, 'utf8'));
for (const p of Object.values(state.players)) if (p.kind === 'human') p.kind = 'ai';
if (!state.players[seat]) throw new Error(`No seat ${seat} in this save`);
state.players[seat].kind = 'human';
const tag = process.env.TAG ?? `t${state.turn}`;
const savePath = join(out, `${tag}-save.json`);
writeFileSync(
  savePath,
  JSON.stringify({
    format: 'civius-maximus-save',
    version: 1,
    name: 'review',
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
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-background-networking',
  ],
});
const problems = [];
const findings = [];

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
  const touch = size === 'phone' || size === 'tablet';
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: touch,
    reducedMotion: process.env.REDUCE === '1' ? 'reduce' : 'no-preference',
  });
  await context.addInitScript(
    ([v, large, hints]) => {
      try {
        localStorage.setItem(
          'cx.settings',
          JSON.stringify({ view: v, showFps: true, largeText: large }),
        );
        // First-game hints are off unless asked for (HINTS=1): they cover what's under review.
        if (!hints) localStorage.setItem('cx.hints.off', '1');
      } catch {
        // No storage: the defaults apply.
      }
    },
    [view, process.env.LARGE === '1', process.env.HINTS === '1'],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${size} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${size}: ${m.text()}`));
  await page.goto(`${base}?debug`, { waitUntil: 'networkidle' });
  await page.click('.home-entry:has-text("Load game")');
  await page.waitForSelector('.mx-saves');
  await page.setInputFiles('.mx-saves input[type=file]', savePath);
  await page.waitForSelector('canvas', { timeout: 120000 });
  await page.waitForFunction(
    () => !/^0 fps/.test(document.querySelector('.fps')?.textContent ?? '0 fps'),
    null,
    { timeout: 180000 },
  );
  const intro = await page.$('.leader-intro .primary');
  if (intro) await intro.click();
  await page.waitForTimeout(view === '3d' ? 5000 : 1500);

  const shot = async (name, { audit = true } = {}) => {
    const label = `${tag}-${size}-${name}`;
    await page.screenshot({ path: `${out}/${label}.png` });
    if (audit) findings.push(...(await auditPage(page, label, { touch })));
  };
  /** One step: a failure is a problem to report, not the end of the run. */
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      problems.push(`${size} ${name}: ${String(e.message ?? e).split('\n')[0]}`);
      await page.keyboard.press('Escape').catch(() => {});
    }
  };
  const settle = (ms = 500) => page.waitForTimeout(ms);
  const center = () => page.mouse.move(viewport.width / 2, viewport.height / 2);

  // The "welcome back" summary a resumed game opens with.
  if (want('hud')) {
    await step('hud', async () => {
      await shot('hud-welcome');
      const close = await page.$('.turn-summary .close');
      if (close) await close.click();
      await settle(300);
      await shot('hud');
    });
  } else {
    const close = await page.$('.turn-summary .close');
    if (close) await close.click();
  }

  const ids = await page.evaluate((me) => {
    const s = window.cx.game.state;
    const mine = Object.values(s.units).filter((u) => u.owner === me);
    const def = (u) => window.cx.ctx.content.entities.unit[u.type];
    const soldier = mine.find((u) => (def(u)?.strength ?? 0) > 0);
    const civilian = mine.find((u) => !(def(u)?.strength > 0));
    const cities = Object.values(s.settlements).filter((x) => x.owner === me);
    const biggest = [...cities].sort((a, b) => b.population - a.population)[0];
    const town = cities.find((x) => x.kind === 'town');
    return {
      capital: s.players[me].capital,
      biggest: biggest?.id,
      town: town?.id,
      soldier: soldier?.id,
      civilian: civilian?.id,
      tile: biggest ? biggest.worked[0] : undefined,
    };
  }, seat);

  // Hover each number in the top bar (the breakdown tooltips), a civ chip and a tracker.
  if (want('tips')) {
    await step('tips', async () => {
      const items = await page.$$('.empire-yields > li');
      for (let i = 0; i < items.length; i++) {
        if (!(await items[i].isVisible())) continue;
        await items[i].hover();
        await settle(700);
        await shot(`tip-yield${i}`);
      }
      const chip = (await page.$$('.player-chip'))[1];
      if (chip && (await chip.isVisible())) {
        await chip.hover();
        await settle(700);
        await shot('tip-chip');
      }
      const tracker = await page.$('.tracker');
      if (tracker && (await tracker.isVisible())) {
        await tracker.hover();
        await settle(700);
        await shot('tip-tracker');
      }
      const button = (await page.$$('.screen-buttons button'))[2];
      if (button && (await button.isVisible())) {
        await button.hover();
        await settle(700);
        await shot('tip-screen-button');
      }
      await center();
    });
  }

  if (want('city')) {
    for (const [name, id] of [
      ['city', ids.biggest ?? ids.capital],
      ['town', ids.town],
    ]) {
      if (!id) continue;
      await step(name, async () => {
        await page.evaluate((x) => window.cx.select('settlement', x), id);
        await page.waitForSelector('.settlement-panel');
        await settle(700);
        await shot(name);
        const tabs = await page.$$('.city-tabs [role=tab]');
        for (let i = 0; i < tabs.length; i++) {
          await tabs[i].click();
          await settle(400);
          await shot(`${name}-tab${i}`);
        }
        // A build row's tooltip (what the item does).
        if (tabs[0]) {
          await tabs[0].click();
          const row = await page.$('.settlement-panel .items li, .settlement-panel .items > *');
          if (row && (await row.isVisible())) {
            await row.hover();
            await settle(700);
            await shot(`${name}-item-tip`);
          }
        }
        await center();
        await page.keyboard.press('Escape');
        await settle(300);
      });
    }
  }

  if (want('unit')) {
    for (const [name, id] of [
      ['unit', ids.soldier],
      ['civilian', ids.civilian],
    ]) {
      if (!id) continue;
      await step(name, async () => {
        await page.evaluate((x) => window.cx.select('unit', x), id);
        await page.waitForSelector('.unit-panel');
        await settle(700);
        await shot(name);
        const action = await page.$('.unit-actions button');
        if (action && (await action.isVisible())) {
          await action.hover();
          await settle(700);
          await shot(`${name}-action-tip`);
        }
        await center();
        await page.keyboard.press('Escape');
        await settle(300);
      });
    }
  }

  if (want('tile') && ids.tile !== undefined) {
    await step('tile', async () => {
      await page.evaluate((t) => window.cx.view.onSelect(t), ids.tile);
      await settle(600);
      await shot('tile');
      await page.keyboard.press('Escape');
      const close = await page.$('.game-tile .close');
      if (close) await close.click();
      await settle(200);
    });
  }

  if (want('lenses')) {
    await step('lenses', async () => {
      const button = await page.$('.lens-button');
      if (!button || !(await button.isVisible())) {
        console.log(`${size}: no lens button`);
        return;
      }
      const openMenu = async () => {
        if (!(await page.$('.lens-menu'))) await page.click('.lens-button');
        await page.waitForSelector('.lens-menu');
      };
      await openMenu();
      await settle(600);
      await shot('lens-menu');
      const labels = await page.$$eval('.lens-menu button strong', (els) =>
        els.map((e) => e.textContent.trim()),
      );
      // Picked through the DOM, so an entry that something covers is still tried (the audit
      // of the open menu reports the covering).
      for (let i = 1; i < labels.length; i++) {
        await openMenu();
        await page.$$eval('.lens-menu button', (els, n) => els[n].click(), i);
        await settle(view === '3d' ? 1500 : 700);
        const label = labels[i].toLowerCase().replace(/\W+/g, '-');
        await shot(`lens-${String(i).padStart(2, '0')}-${label}`);
      }
      await openMenu();
      await page.$$eval('.lens-menu button', (els) => els[0].click());
      await settle(200);
    });
  }

  if (want('diplomacy')) {
    await step('diplomacy', async () => {
      const chips = await page.$$('.player-chip:not(.me):not(.dead)');
      if (!chips[0]) return;
      await chips[0].click();
      await page.waitForSelector('.player-panel');
      await settle(700);
      await shot('diplomacy');
      const deal = await page.$(
        '.diplo-actions button:has-text("deal"), .diplo-actions button:has-text("Deal")',
      );
      if (deal && (await deal.isEnabled())) {
        await deal.click();
        await page.waitForSelector('.modal.deal');
        await settle(500);
        await shot('deal');
        await page.keyboard.press('Escape');
        await page.waitForSelector('.modal.deal', { state: 'detached', timeout: 2500 });
        if (!(await page.$('.player-panel')))
          problems.push(`${size}: Esc on the deal screen also closed diplomacy`);
      }
      await page.keyboard.press('Escape');
      await settle(400);
      if (await page.$('.player-panel')) problems.push(`${size}: diplomacy did not close with Esc`);
      // A city-state's panel, if one is known.
    });
  }

  if (want('menu')) {
    await step('menu', async () => {
      await page.click('.menu-button');
      await settle(400);
      await shot('menu');
      await page.keyboard.press('Escape');
      await settle(300);
    });
  }

  if (want('screens')) {
    for (const [name, key] of SCREENS) {
      if (onlyScreens && !onlyScreens.includes(name)) continue;
      await step(name, async () => {
        await center();
        await page.keyboard.press(key);
        const opened = await page
          .waitForSelector('.screen, .mx', { timeout: 2500 })
          .then(() => true)
          .catch(() => false);
        // Some screens only exist when their system is on (espionage, congress, climate).
        if (!opened) {
          console.log(`${size}: ${name} (${key}) is not in this game`);
          return;
        }
        await settle(viewport.width > 2000 ? 2500 : 900);
        await shot(name);
        // Each tab of the screen.
        const tabs = await page.$$('.screen [role=tab], .mx [role=tab]');
        for (let i = 1; i < tabs.length; i++) {
          const fresh = (await page.$$('.screen [role=tab], .mx [role=tab]'))[i];
          if (!fresh || !(await fresh.isVisible())) continue;
          const label = (await fresh.textContent())?.trim().split(/\s+/)[0]?.toLowerCase() ?? i;
          await fresh.click();
          await settle(700);
          await shot(`${name}-${label}`);
        }
        if (tabs.length > 1) {
          const first = (await page.$$('.screen [role=tab], .mx [role=tab]'))[0];
          if (first && (await first.isVisible())) await first.click();
        }
        // The bottom of a long screen.
        const scrolled = await page.evaluate(() => {
          const boxes = [...document.querySelectorAll('.screen *, .mx *')].filter((el) => {
            const s = getComputedStyle(el);
            return (
              (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
              el.scrollHeight > el.clientHeight + 40 &&
              el.clientHeight > 200
            );
          });
          const box = boxes.sort((a, b) => b.clientHeight - a.clientHeight)[0];
          if (!box) return false;
          box.scrollTop = box.scrollHeight;
          return true;
        });
        if (scrolled) {
          await settle(400);
          await shot(`${name}-end`);
        }
        await page.keyboard.press('Escape');
        await page
          .waitForSelector('.screen, .mx', { state: 'detached', timeout: 2500 })
          .catch(() => problems.push(`${size}: ${name} did not close with Esc`));
        await settle(200);
      });
    }
  }
  console.log(`${size}: done`);
  await context.close();
}
await browser.close();
writeFileSync(join(out, `${tag}-findings.json`), JSON.stringify(findings, null, 1));
const summary = summarize(findings);
writeFileSync(join(out, `${tag}-findings.txt`), `${summary.join('\n')}\n`);
console.log(`${findings.length} audit findings in ${summary.length} groups (${tag}-findings.txt)`);
console.log(problems.length ? problems.join('\n') : 'no problems');
process.exitCode = problems.length ? 1 : 0;
