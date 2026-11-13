// Every screen before a game, for a release review, at every screen size: the title screen (a
// first visit, and one with a game to continue, a record and an online game to host again),
// Options (each tab), New game (players, the leader picker, world, rules), Load game (empty and
// with saves), Play online (host, join, the lobby), Account, the Civilopedia (front page, tree,
// search and an article of every kind), the Hall of Fame (empty and with games), the Map Lab
// and the portrait gallery. Each state is screenshotted and run through the DOM audit
// (scripts/audit.mjs).
//
//   node packages/client/scripts/review-menus.mjs <out-dir> [state.json]
//
// A save made with `pnpm cx profile ... --save` (optional) gives Load game and Continue something
// real to show. Env: SIZES (comma list of wide, fhd, mac, desk, short, tablet, phone; default
// all), ONLY (comma list: title, options, setup, load, online, account, pedia, fame, lab,
// gallery, large), BASE_URL (a vite preview).
// Writes <out-dir>/<size>-<state>.png, menus-findings.json/.txt, and exits 1 on a console error
// or a step that fails.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { auditPage, quiet, summarize } from './audit.mjs';

const [out, saveArg] = process.argv.slice(2);
if (!out) throw new Error('Usage: review-menus.mjs <out-dir> [state.json]');
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const SIZES = {
  wide: { width: 2560, height: 1440 },
  fhd: { width: 1920, height: 1080 },
  mac: { width: 1440, height: 900 },
  desk: { width: 1280, height: 800 },
  short: { width: 1280, height: 640 },
  tablet: { width: 820, height: 1100 },
  phone: { width: 390, height: 844 },
};
const sizes = (process.env.SIZES ?? Object.keys(SIZES).join(',')).split(',');
const only = process.env.ONLY?.split(',');
const want = (name) => !only || only.includes(name);

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

// A save to continue and to list (p1 the human), under a few names, one of them long.
let saves = [];
if (saveArg) {
  const state = JSON.parse(readFileSync(saveArg, 'utf8'));
  for (const p of Object.values(state.players)) if (p.kind === 'human') p.kind = 'ai';
  state.players.p1.kind = 'human';
  const file = (id, name, minutesAgo) => ({
    id,
    format: 'civius-maximus-save',
    version: 1,
    name,
    savedAt: new Date(Date.now() - minutesAgo * 60000).toISOString(),
    turn: state.turn,
    contentHash: state.contentHash,
    state,
  });
  saves = [
    file('autosave', `Autosave · turn ${state.turn}`, 3),
    file('quicksave', `Quick save · turn ${state.turn}`, 50),
    file('save-1', 'Before the war with Rome', 60 * 5),
    file(
      'save-2',
      'The very long name of a save somebody typed without stopping to think about where it would have to fit',
      60 * 30,
    ),
    file('save-3', 'Friday game', 60 * 24 * 9),
  ];
}
const fame = [
  {
    id: 'g1',
    date: '2026-10-30T12:00:00Z',
    player: 'You',
    leader: 'Julius Caesar',
    civ: 'Rome',
    won: true,
    reason: 'domination',
    winner: 'You',
    turn: 212,
    score: 418,
    difficulty: 'Prince',
    speed: 'Standard',
    map: 'Continents · small',
    players: 4,
  },
  {
    id: 'g2',
    date: '2026-10-21T12:00:00Z',
    player: 'Bartholomew Featherstonehaugh-Cholmondeley',
    leader: 'Cleopatra',
    civ: 'Egypt',
    won: false,
    reason: 'science',
    winner: 'Rival 2',
    turn: 174,
    score: 301,
    difficulty: 'King',
    speed: 'Quick',
    map: 'Continents and Islands · standard',
    players: 6,
  },
  {
    id: 'g3',
    date: '2026-10-11T12:00:00Z',
    player: 'You',
    leader: 'Julius Caesar',
    civ: 'Rome',
    won: true,
    reason: 'culture',
    winner: 'You',
    turn: 260,
    score: 512,
    difficulty: 'Prince',
    speed: 'Epic',
    map: 'Archipelago · small',
    players: 4,
  },
  {
    id: 'g4',
    date: '2026-09-02T12:00:00Z',
    player: 'You',
    leader: 'Pericles',
    civ: 'Greece',
    won: false,
    reason: 'score',
    winner: 'Rival 5',
    turn: 500,
    score: 1288,
    difficulty: 'Deity',
    speed: 'Marathon',
    map: 'Pangaea · huge',
    players: 12,
  },
];

for (const size of sizes) {
  const viewport = SIZES[size];
  if (!viewport) throw new Error(`Unknown size ${size}`);
  const touch = size === 'phone' || size === 'tablet';

  /** A page on the title screen. `seeded`: with saves, a record and an online game to resume. */
  const open = async ({ seeded = false, settings = {}, hash = '', query = '' } = {}) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
    await context.addInitScript(
      ([s, f]) => {
        try {
          localStorage.setItem('cx.settings', JSON.stringify({ view: '2d', ...s }));
          if (f) localStorage.setItem('cx.hallOfFame', JSON.stringify(f));
        } catch {
          // No storage: the defaults apply.
        }
      },
      [settings, seeded ? fame : null],
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => problems.push(`${size} pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && problems.push(`${size}: ${m.text()}`));
    await page.goto(`${base}${query}${hash}`, { waitUntil: 'networkidle' });
    if (seeded && saves.length > 0) {
      // Saves live in IndexedDB: put them there, then load the page again so it finds them.
      await page.evaluate(
        (records) =>
          new Promise((resolve, reject) => {
            const req = indexedDB.open('civius-maximus', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('saves', { keyPath: 'id' });
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
              const tx = req.result.transaction('saves', 'readwrite');
              for (const r of records) tx.objectStore('saves').put(r);
              tx.oncomplete = () => resolve(null);
              tx.onerror = () => reject(tx.error);
            };
          }),
        [...saves, { ...saves[0], id: 'autosave-online', name: 'Online autosave' }],
      );
      await page.reload({ waitUntil: 'networkidle' });
    }
    return { page, context };
  };
  const shot = async (page, name, { audit = true } = {}) => {
    const label = `${size}-${name}`;
    await quiet(page);
    await page.screenshot({ path: `${out}/${label}.png` });
    if (audit) findings.push(...(await auditPage(page, label, { touch })));
  };
  const step = async (name, fn) => {
    if (!want(name.split('-')[0])) return;
    let ctx;
    try {
      ctx = await fn();
    } catch (e) {
      problems.push(`${size} ${name}: ${String(e.message ?? e).split('\n')[0]}`);
    }
    await ctx?.context.close().catch(() => {});
  };
  const settle = (page, ms = 500) => page.waitForTimeout(ms);
  /** Scrolls the tallest scrolling box of a menu screen to its end. */
  const toEnd = (page) =>
    page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.mx *, .home, .home *')].filter((el) => {
        const s = getComputedStyle(el);
        return (
          (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 40 &&
          el.clientHeight > 160
        );
      });
      const box = boxes.sort((a, b) => b.clientHeight - a.clientHeight)[0];
      if (!box) return false;
      box.scrollTop = box.scrollHeight;
      return true;
    });

  await step('title', async () => {
    const c = await open();
    await c.page.waitForSelector('.home');
    await settle(c.page, 900);
    await shot(c.page, 'title-first');
    if (await toEnd(c.page)) {
      await settle(c.page, 300);
      await shot(c.page, 'title-first-end');
    }
    return c;
  });
  await step('title-seeded', async () => {
    const c = await open({ seeded: true });
    await c.page.waitForSelector('.home');
    await settle(c.page, 900);
    await shot(c.page, 'title-seeded');
    if (await toEnd(c.page)) {
      await settle(c.page, 300);
      await shot(c.page, 'title-seeded-end');
    }
    return c;
  });
  await step('title-return', async () => {
    const c = await open({ hash: '#play' });
    const { page } = c;
    await page.waitForSelector('canvas', { timeout: 60000 });
    await page.waitForSelector('.leader-intro .primary', { timeout: 30000 }).catch(() => {});
    if (await page.$('.leader-intro .primary')) await page.click('.leader-intro .primary');
    await page.click('.menu-button');
    await page.click('.menu-pop button:has-text("Title screen")');
    await page.waitForSelector('.home-entry:has-text("Return to game")');
    await settle(page, 800);
    await shot(page, 'title-return');
    return c;
  });

  await step('options', async () => {
    const c = await open();
    const { page } = c;
    await page.click('.home-entry:has-text("Options")');
    await page.waitForSelector('.mx-options');
    for (const tab of ['Sound', 'Graphics', 'Interface', 'Game and saves', 'Controls', 'About']) {
      await page.click(`.mx-nav button:has-text("${tab}")`);
      await settle(page, 300);
      await shot(page, `options-${tab.split(' ')[0].toLowerCase()}`);
      if (await toEnd(page)) {
        await settle(page, 200);
        await shot(page, `options-${tab.split(' ')[0].toLowerCase()}-end`);
      }
    }
    return c;
  });

  await step('setup', async () => {
    const c = await open();
    const { page } = c;
    await page.click('.home-entry:has-text("New game")');
    await page.waitForSelector('.mx-setup');
    await settle(page, 500);
    await shot(page, 'setup-players-random');
    await page.click('button:has-text("Choose leader")');
    await page.waitForSelector('.mx-picker');
    await settle(page, 500);
    await shot(page, 'setup-picker');
    await page.click('.mx-tile:has-text("Cleopatra")').catch(() => {});
    await settle(page, 300);
    await shot(page, 'setup-picker-pointed');
    await page.click('.mx-picker-choose button').catch(() => {});
    await page.waitForSelector('.mx-picker', { state: 'detached' }).catch(() => {});
    // Fill the map with rivals (the stress case for the seat list), then look at the seats.
    for (let i = 0; i < 4; i++) await page.click('button:has-text("AI rival")').catch(() => {});
    await settle(page, 300);
    await shot(page, 'setup-players');
    if (await toEnd(page)) {
      await settle(page, 200);
      await shot(page, 'setup-players-end');
    }
    await page.click('.mx-steps button:has-text("World")');
    // Every map type's picture is drawn by the real generator, one after another.
    await page
      .waitForFunction(
        () => document.querySelectorAll('.mx-maptype canvas, .mx-maptype img').length >= 12,
        null,
        { timeout: 45000 },
      )
      .catch(() => {});
    await settle(page, 1500);
    await shot(page, 'setup-world');
    if (await toEnd(page)) {
      await settle(page, 200);
      await shot(page, 'setup-world-end');
    }
    await page.click('.mx-steps button:has-text("Rules")');
    await settle(page, 400);
    await shot(page, 'setup-rules');
    if (await toEnd(page)) {
      await settle(page, 200);
      await shot(page, 'setup-rules-end');
    }
    return c;
  });

  await step('load', async () => {
    const c = await open();
    await c.page.click('.home-entry:has-text("Load game")');
    await c.page.waitForSelector('.mx-saves');
    await settle(c.page, 500);
    await shot(c.page, 'load-empty');
    return c;
  });
  if (saves.length > 0)
    await step('load-seeded', async () => {
      const c = await open({ seeded: true });
      await c.page.click('.home-entry:has-text("Load game")');
      await c.page.waitForSelector('.mx-saves');
      await settle(c.page, 800);
      await shot(c.page, 'load-saves');
      return c;
    });

  await step('online', async () => {
    const c = await open({ query: '?net=local' });
    const { page } = c;
    await page.click('.home-entry:has-text("Play online")');
    await page.waitForSelector('.mx-online');
    await settle(page, 500);
    await shot(page, 'online-host');
    if (await toEnd(page)) {
      await settle(page, 200);
      await shot(page, 'online-host-end');
    }
    await page.click('.mx-online-mode button:has-text("Join with a code")');
    await settle(page, 400);
    await shot(page, 'online-join');
    await page.click('.mx-online-mode button:has-text("Host")').catch(() => {});
    await settle(page, 300);
    const host = await page.$('.mx-foot button.primary, .mx button.primary');
    if (host) {
      await host.click();
      await page
        .waitForSelector('.mx-lobby, .lobby, .mx-code', { timeout: 15000 })
        .catch(() => problems.push(`${size} online: the lobby did not open`));
      await settle(page, 800);
      await shot(page, 'online-lobby');
    }
    return c;
  });

  await step('account', async () => {
    const c = await open();
    await c.page.click('.home-chip:has-text("Sign in")');
    await c.page.waitForSelector('.mx-account');
    await settle(c.page, 400);
    await shot(c.page, 'account');
    return c;
  });

  await step('pedia', async () => {
    const c = await open();
    const { page } = c;
    await page.click('.home-entry:has-text("Civilopedia")');
    await page.waitForSelector('.mx-pedia');
    await settle(page, 500);
    await shot(page, 'pedia-home');
    if (await toEnd(page)) {
      await settle(page, 200);
      await shot(page, 'pedia-home-end');
    }
    const search = 'input[aria-label="Search the Civilopedia"]';
    const browse = async () => {
      if (!(await page.$(search)) || !(await page.isVisible(search)))
        await page.click('.pedia-browse').catch(() => {});
    };
    await browse();
    await page.fill(search, 'trade');
    await settle(page, 400);
    await shot(page, 'pedia-search');
    // An article of every kind, the gameplay pass's additions among them.
    const articles = [
      ['concept', 'Districts and adjacency'],
      ['concept-victory', 'Victory'],
      ['civ', 'Rome'],
      ['leader', 'Cleopatra'],
      ['unit', 'Legionary'],
      ['unit-new', 'Nuclear Submarine'],
      ['unit-support', 'Battering Ram'],
      ['building', 'Library'],
      ['building-plaza', 'Royal Pages School'],
      ['district', 'Campus'],
      ['district-new', 'Neighborhood'],
      ['district-dam', 'Dam'],
      ['district-preserve', 'Preserve'],
      ['wonder', 'Pyramids'],
      ['improvement', 'National Park'],
      ['tech', 'Gunpowder'],
      ['civic', 'Mercantilism'],
      ['government', 'Merchant Republic'],
      ['government-late', 'Technocracy'],
      ['policy', 'Open Fields'],
      ['belief', 'Spirits of the Grove'],
      ['greatperson', 'Albert Einstein'],
      ['citystate', 'Toledo'],
      ['resource', 'Dyes'],
      ['resource-strategic', 'Niter'],
      ['terrain', 'Grassland'],
      ['feature', 'Floodplains'],
      ['promotion', 'Vanguard'],
      ['governor', 'Ysolde'],
      ['age', 'Golden Age'],
      ['project', 'Spaceport'],
      ['specialization', 'Mining'],
      ['resolution', 'Heritage Accord'],
      ['unitclass', 'Anti-cavalry'],
    ];
    for (const [name, term] of articles) {
      await browse();
      await page.fill(search, term);
      await settle(page, 250);
      const row = await page.$(`.pedia-row:has-text("${term}")`);
      if (!row) {
        problems.push(`${size} pedia: no article found for "${term}"`);
        continue;
      }
      await row.click();
      await settle(page, 350);
      await shot(page, `pedia-${name}`);
      if (await toEnd(page)) {
        await settle(page, 150);
        await shot(page, `pedia-${name}-end`);
      }
    }
    return c;
  });

  await step('fame', async () => {
    const c = await open();
    await c.page.click('.home-entry:has-text("Hall of Fame")');
    await c.page.waitForSelector('.mx-fame');
    await settle(c.page, 400);
    await shot(c.page, 'fame-empty');
    return c;
  });
  await step('fame-seeded', async () => {
    const c = await open({ seeded: true });
    await c.page.click('.home-entry:has-text("Hall of Fame")');
    await c.page.waitForSelector('.mx-fame');
    await settle(c.page, 500);
    await shot(c.page, 'fame');
    return c;
  });

  await step('lab', async () => {
    const c = await open({ hash: '#lab' });
    await c.page.waitForSelector('canvas', { timeout: 60000 });
    await settle(c.page, 2500);
    await shot(c.page, 'lab');
    return c;
  });
  await step('gallery', async () => {
    const c = await open({ hash: '#gallery' });
    await settle(c.page, 2500);
    await shot(c.page, 'gallery');
    return c;
  });

  await step('large', async () => {
    const c = await open({ seeded: true, settings: { largeText: true } });
    const { page } = c;
    await page.waitForSelector('.home');
    await settle(page, 700);
    await shot(page, 'large-title');
    await page.click('.home-entry:has-text("New game")');
    await page.waitForSelector('.mx-setup');
    await settle(page, 400);
    await shot(page, 'large-setup');
    await page.keyboard.press('Escape');
    await page.click('.home-entry:has-text("Options")');
    await page.waitForSelector('.mx-options');
    await settle(page, 300);
    await shot(page, 'large-options');
    return c;
  });
  console.log(`${size}: done`);
}
await browser.close();
writeFileSync(join(out, 'menus-findings.json'), JSON.stringify(findings, null, 1));
const summary = summarize(findings);
writeFileSync(join(out, 'menus-findings.txt'), `${summary.join('\n')}\n`);
console.log(`${findings.length} audit findings in ${summary.length} groups (menus-findings.txt)`);
console.log(problems.length ? problems.join('\n') : 'no problems');
process.exitCode = problems.length ? 1 : 0;
