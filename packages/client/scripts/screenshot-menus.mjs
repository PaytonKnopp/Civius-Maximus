// Screenshots of every screen before a game starts: the title screen, Options, the new game
// setup (players, leader picker, world, rules), saves, Civilopedia and the Hall of Fame, at
// desktop and phone size. Usage: node scripts/screenshot-menus.mjs <out-dir>
// (BASE_URL: a vite preview; ONLY=title,options to pick screens)
import { chromium } from 'playwright';

const out = process.argv[2];
if (!out) throw new Error('Usage: node scripts/screenshot-menus.mjs <out-dir>');
const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const only = process.env.ONLY?.split(',');
const want = (name) => !only || only.includes(name);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const sizes = {
  desktop: { width: 1280, height: 800 },
  short: { width: 1280, height: 560 },
  tablet: { width: 820, height: 1100 },
  phone: { width: 390, height: 780 },
};

// The map under the menus is 2D unless asked for (the 3D view is slow in a software renderer).
const flat = `localStorage.setItem('cx.settings', JSON.stringify({ view: '2d' }));`;

async function open(size, seed, view = '2d') {
  const page = await browser.newPage({ viewport: sizes[size], deviceScaleFactor: 1 });
  if (view === '2d') await page.addInitScript(flat);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.stack ?? e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (seed) await page.addInitScript(seed);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('.home');
  await page.waitForTimeout(600);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const overflow = async (page, name) => {
  const bad = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll('.mx *, .home *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (r.width === 0 || r.right <= w + 1 || s.position === 'fixed') return false;
        // Inside a strip that scrolls sideways on purpose.
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if ((o === 'auto' || o === 'scroll') && p.getBoundingClientRect().right <= w + 1)
            return false;
        }
        return true;
      })
      .slice(0, 4)
      .map((el) => `${el.tagName}.${el.className}`);
  });
  if (bad.length) errors.push(`${name}: sticks out to the right: ${bad.join(', ')}`);
};

// Some history in the browser, so the Hall of Fame and Continue have something to show.
const seeded = `
  localStorage.setItem('cx.hallOfFame', JSON.stringify([
    { id: 'g1', date: '2026-10-30T12:00:00Z', player: 'You', leader: 'Julius Caesar', civ: 'Rome', won: true, reason: 'domination', winner: 'You', turn: 212, score: 418, difficulty: 'Prince', speed: 'Standard', map: 'Continents · small', players: 4 },
    { id: 'g2', date: '2026-10-21T12:00:00Z', player: 'You', leader: 'Cleopatra', civ: 'Egypt', won: false, reason: 'science', winner: 'Rival 2', turn: 174, score: 301, difficulty: 'King', speed: 'Quick', map: 'Pangaea · standard', players: 6 },
    { id: 'g3', date: '2026-10-11T12:00:00Z', player: 'You', leader: 'Julius Caesar', civ: 'Rome', won: true, reason: 'culture', winner: 'You', turn: 260, score: 512, difficulty: 'Prince', speed: 'Epic', map: 'Archipelago · small', players: 4 },
  ]));
`;

for (const size of ['desktop', 'short', 'phone', 'tablet']) {
  if (want('title')) {
    const page = await open(size, seeded, size === 'desktop' ? '3d' : '2d');
    await shot(page, `title-${size}`);
    await overflow(page, `title-${size}`);
    await page.close();
  }
}

if (want('options')) {
  for (const size of ['desktop', 'phone']) {
    const page = await open(size);
    await page.click('button:has-text("Options")');
    await page.waitForSelector('.mx-options');
    for (const tab of ['Sound', 'Graphics', 'Interface', 'Game and saves', 'Controls', 'About']) {
      await page.click(`.mx-nav button:has-text("${tab}")`);
      await shot(page, `options-${size}-${tab.split(' ')[0].toLowerCase()}`);
    }
    await overflow(page, `options-${size}`);
    await page.close();
  }
}

if (want('setup')) {
  for (const size of ['desktop', 'phone']) {
    const page = await open(size);
    await page.click('.home-entry:has-text("New game")');
    await page.waitForSelector('.mx-setup');
    await shot(page, `setup-${size}-players-random`);
    await page.click('button:has-text("Choose leader")');
    await page.waitForSelector('.mx-picker');
    await page.waitForTimeout(300);
    await shot(page, `setup-${size}-picker`);
    await page.click('.mx-tile:has-text("Cleopatra")').catch(() => {});
    await page.waitForTimeout(200);
    await page.click('.mx-picker-choose button').catch(() => {});
    await page.waitForSelector('.mx-picker', { state: 'detached' }).catch(() => {});
    await page.click('.mx-swatch[aria-label="Teal"]').catch(() => {});
    await page.waitForTimeout(200);
    await shot(page, `setup-${size}-players`);
    await overflow(page, `setup-${size}-players`);
    await page.click('.mx-steps button:has-text("World")');
    await page.waitForTimeout(900);
    await shot(page, `setup-${size}-world`);
    await overflow(page, `setup-${size}-world`);
    await page.click('.mx-steps button:has-text("Rules")');
    await shot(page, `setup-${size}-rules`);
    await overflow(page, `setup-${size}-rules`);
    await page.close();
  }
}

if (want('pedia')) {
  for (const size of ['desktop', 'phone']) {
    const page = await open(size);
    await page.click('.home-entry:has-text("Civilopedia")');
    await page.waitForSelector('.mx-pedia');
    await page.waitForTimeout(400);
    await shot(page, `pedia-${size}-home`);
    const browse = size === 'phone' ? () => page.click('.pedia-browse') : async () => {};
    await browse();
    await page.click('.pedia-cat-head:has-text("Units")');
    await page.waitForTimeout(200);
    await shot(page, `pedia-${size}-tree`);
    await page.fill('input[aria-label="Search the Civilopedia"]', 'legion');
    await page.waitForTimeout(200);
    await shot(page, `pedia-${size}-search`);
    await page.click('.pedia-row:has-text("Legionary")');
    await page.waitForTimeout(300);
    await shot(page, `pedia-${size}-unit`);
    await overflow(page, `pedia-${size}-unit`);
    await page.click('.pedia-main .pedia-link:has-text("Rome")');
    await page.waitForTimeout(300);
    await shot(page, `pedia-${size}-civ`);
    await browse();
    await page.fill('input[aria-label="Search the Civilopedia"]', 'library');
    await page.click('.pedia-row:has-text("Library")');
    await page.waitForTimeout(300);
    await shot(page, `pedia-${size}-building`);
    await overflow(page, `pedia-${size}`);
    await page.close();
  }
}

if (want('fame')) {
  for (const size of ['desktop', 'phone']) {
    const page = await open(size, seeded);
    await page.click('.home-entry:has-text("Hall of Fame")');
    await page.waitForSelector('.mx-fame');
    await shot(page, `fame-${size}`);
    await overflow(page, `fame-${size}`);
    await page.close();
  }
}

if (want('load')) {
  for (const size of ['desktop', 'phone']) {
    const page = await open(size);
    await page.click('.home-entry:has-text("Load game")');
    await page.waitForSelector('.mx-saves');
    await shot(page, `load-${size}`);
    await page.close();
  }
}

if (want('online')) {
  const page = await open('desktop');
  await page.click('.home-entry:has-text("Play online")');
  await page.waitForSelector('.mx-online');
  await shot(page, 'online-host');
  await page.click('.mx-online-mode button:has-text("Join with a code")');
  await shot(page, 'online-join');
  await page.close();
}

if (want('account')) {
  for (const size of ['desktop', 'phone']) {
    const page = await open(size);
    await page.click('.home-chip:has-text("Sign in")');
    await page.waitForSelector('.mx-account');
    await page.waitForTimeout(300);
    await shot(page, `account-${size}`);
    await overflow(page, `account-${size}`);
    await page.close();
  }
}

if (want('large')) {
  // Options: larger menu text, then the title screen and the setup at that size.
  const page = await open(
    'desktop',
    `localStorage.setItem('cx.settings', JSON.stringify({ view: '2d', largeText: true }));`,
    '3d-skip',
  );
  await page.waitForTimeout(400);
  await shot(page, 'large-title');
  await overflow(page, 'large-title');
  await page.keyboard.press('n');
  await page.waitForSelector('.mx-setup');
  await page.waitForTimeout(300);
  await shot(page, 'large-setup');
  await overflow(page, 'large-setup');
  await page.close();
}

if (want('resume')) {
  // Quick game, then the title screen from the game's menu: Return to game is offered, and
  // Escape goes back.
  const page = await open('desktop');
  await page.keyboard.press('q');
  await page.waitForSelector('.home', { state: 'hidden' });
  await page.waitForSelector('.leader-intro .primary', { timeout: 15000 }).catch(() => {});
  if (await page.$('.leader-intro .primary')) await page.click('.leader-intro .primary');
  await page.click('.menu-button');
  await page.click('.menu-pop button:has-text("Title screen")');
  await page.waitForSelector('.home-entry:has-text("Return to game")');
  await page.waitForTimeout(800);
  await shot(page, 'resume-title');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.home', { state: 'hidden' });
  // The game menu opens Options and the Civilopedia over the game.
  await page.click('.menu-button');
  await page.click('.menu-pop button:has-text("Options")');
  await page.waitForSelector('.mx-options');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.mx-options', { state: 'detached' });
  await shot(page, 'resume-game');
  await page.close();
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
console.log('done');
