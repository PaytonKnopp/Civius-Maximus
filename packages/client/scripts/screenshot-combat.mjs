// Stages a fight through the `?debug` hook and screenshots each step: the attack preview while
// at peace, the declare-war prompt, the hit (floating damage), a siege preview with walls, the
// capture dialog, and the player panel. Usage: node scripts/screenshot-combat.mjs <out-dir>
import { chromium } from 'playwright';
const out = process.argv[2];
const url = `${process.env.BASE_URL ?? 'http://localhost:4173/'}?debug`;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.stack ?? e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas');
await page.waitForFunction(
  () => !/^0 fps/.test(document.querySelector('.fps')?.textContent ?? '0 fps'),
);
await page.keyboard.press('Enter');
await page.waitForSelector('.unit-panel');
await page.keyboard.press('b');
await page.waitForSelector('.settlement-panel');

// March our warrior (and a swordsman and an archer) next to p2's capital, weaken its walls.
const setup = await page.evaluate(() => {
  const { game, hex } = window.cx;
  const s = structuredClone(game.state);
  const enemy = Object.values(s.settlements).find((x) => x.owner !== 'p1');
  const land = (t) =>
    !['coast', 'ocean', 'lake'].includes(s.map.tiles[t].terrain) &&
    s.map.tiles[t].elevation !== 'mountain';
  const free = (t) => !Object.values(s.units).some((u) => u.tile === t);
  const around = hex
    .tilesWithin(s.map, enemy.tile, 2)
    .filter((t) => t !== enemy.tile && land(t) && free(t))
    .sort(
      (a, b) => hex.distance(s.map, enemy.tile, a) - hex.distance(s.map, enemy.tile, b) || a - b,
    );
  const adjacent = around.filter((t) => hex.distance(s.map, enemy.tile, t) === 1);
  const warrior = Object.values(s.units).find((u) => u.owner === 'p1' && u.type === 'unit_warrior');
  warrior.tile = adjacent[0];
  const add = (type, tile) => {
    const id = `u${s.nextEntityId++}`;
    s.units[id] = { ...warrior, id, type, tile, moves: 200, health: 100 };
    return id;
  };
  const sword = add('unit_swordsman', adjacent[1]);
  const archer = add(
    'unit_archer',
    around.find((t) => hex.distance(s.map, enemy.tile, t) === 2),
  );
  // An enemy warrior next to ours, so there's a unit fight too.
  const guard = Object.values(s.units).find(
    (u) => u.owner === enemy.owner && u.type === 'unit_warrior',
  );
  if (guard) guard.tile = adjacent[2];
  enemy.buildings.push('building_walls');
  enemy.walls = 40;
  game.load(s);
  window.cx.view.focusTile(enemy.tile, true);
  window.cx.view.dist = 9;
  return {
    warrior: warrior.id,
    sword,
    archer,
    enemy: enemy.id,
    enemyTile: enemy.tile,
    owner: enemy.owner,
    guard: guard?.tile ?? null,
  };
});
console.log('setup:', JSON.stringify(setup));
await page.waitForTimeout(1500);

// 1. Hover the enemy guard with our warrior selected: preview with "at peace".
await page.evaluate(({ warrior }) => window.cx.select('unit', warrior), setup);
const first = setup.guard ?? setup.enemyTile;
await page.evaluate((t) => window.cx.view.onHover(t), first);
await page.waitForSelector('.combat-preview');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/combat-peace-preview.png` });
console.log('preview:', (await page.textContent('.combat-preview'))?.replace(/\s+/g, ' '));

// 2. Click: the declare-war prompt.
await page.evaluate((t) => window.cx.view.onSelect(t), first);
await page.waitForSelector('.modal');
await page.screenshot({ path: `${out}/combat-war-prompt.png` });
await page.click('.modal button.danger');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/combat-hit.png` });
console.log('notices:', (await page.textContent('.notices'))?.replace(/\s+/g, ' '));

// 3. The archer on the walls, then the swordsman's preview against the settlement.
await page.evaluate(({ archer }) => window.cx.select('unit', archer), setup);
await page.evaluate((t) => window.cx.view.onHover(t), setup.enemyTile);
await page.waitForTimeout(300);
console.log('archer preview:', (await page.textContent('.combat-preview'))?.replace(/\s+/g, ' '));
await page.evaluate((t) => window.cx.view.onSelect(t), setup.enemyTile);
await page.waitForTimeout(300);
await page.evaluate(({ sword }) => window.cx.select('unit', sword), setup);
await page.evaluate((t) => window.cx.view.onHover(t), setup.enemyTile);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/combat-siege-preview.png` });
console.log('siege preview:', (await page.textContent('.combat-preview'))?.replace(/\s+/g, ' '));

// 4. Bring the settlement to 1 HP and take it.
await page.evaluate(({ enemy }) => {
  const s = structuredClone(window.cx.game.state);
  s.settlements[enemy].health = 1;
  s.settlements[enemy].walls = 0;
  window.cx.game.load(s);
}, setup);
await page.evaluate(({ sword }) => window.cx.select('unit', sword), setup);
await page.evaluate((t) => window.cx.view.onSelect(t), setup.enemyTile);
await page.waitForTimeout(500);
const dialog = await page.$('.modal');
console.log(
  'capture dialog:',
  dialog ? (await dialog.textContent())?.replace(/\s+/g, ' ') : 'none',
);
await page.screenshot({ path: `${out}/combat-captured.png` });
if (dialog) await page.click('.modal-choices button.primary');

// 5. A veteran: give the swordsman XP, look at its promotions.
await page.evaluate(({ sword }) => {
  const s = structuredClone(window.cx.game.state);
  if (s.units[sword]) {
    s.units[sword].xp = 20;
    s.units[sword].moves = 200;
  }
  window.cx.game.load(s);
  window.cx.select('unit', sword);
}, setup);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/combat-promotion.png` });
console.log('promote:', (await page.textContent('.promote'))?.replace(/\s+/g, ' ') ?? 'none');

// 6. A hostile camp up close.
const camp = await page.evaluate(() => {
  const s = window.cx.game.state;
  const c = Object.values(s.camps)[0];
  if (!c) return null;
  window.cx.view.focusTile(c.tile, true);
  window.cx.view.dist = 7;
  return { tile: c.tile, raiders: c.units.length };
});
console.log('camp:', JSON.stringify(camp));
if (camp) {
  await page.evaluate((t) => {
    // Park a scout next to the camp so it's in view.
    const s = structuredClone(window.cx.game.state);
    const scout = Object.values(s.units).find((u) => u.owner === 'p1' && u.type === 'unit_scout');
    const near = window.cx.hex
      .tilesWithin(s.map, t, 1)
      .find((x) => x !== t && !Object.values(s.units).some((u) => u.tile === x));
    if (scout && near !== undefined) scout.tile = near;
    window.cx.game.load(s);
  }, camp.tile);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/combat-camp.png` });
}

// 7. The player panel for the rival.
await page.click('.player-chip:not(:disabled)');
await page.waitForSelector('.player-panel');
await page.screenshot({ path: `${out}/combat-player-panel.png` });
console.log('panel:', (await page.textContent('.player-panel'))?.replace(/\s+/g, ' '));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
