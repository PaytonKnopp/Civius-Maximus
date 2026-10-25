// Founds a capital, surrounds it with every district and wonder (through the `?debug` hook), and
// screenshots them up close in 3D and in 2D: a visual check of the district and wonder models.
// Usage: node scripts/screenshot-districts.mjs <out-dir>   (BASE_URL defaults to a vite preview)
import { chromium } from 'playwright';
const out = process.argv[2];
const url = `${process.env.BASE_URL ?? 'http://localhost:4173/'}?debug#play`;
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

const placed = await page.evaluate(() => {
  const { game, hex } = window.cx;
  const s = structuredClone(game.state);
  const city = Object.values(s.settlements).find((x) => x.owner === 'p1');
  const water = (t) => ['coast', 'ocean', 'lake'].includes(s.map.tiles[t].terrain);
  const ring = hex
    .tilesWithin(s.map, city.tile, 3)
    .filter((t) => t !== city.tile)
    .sort((a, b) => hex.distance(s.map, city.tile, a) - hex.distance(s.map, city.tile, b) || a - b);
  const land = ring.filter((t) => !water(t) && s.map.tiles[t].elevation !== 'mountain');
  const sea = ring.filter(water);
  const claim = (t) => {
    Object.assign(s.map.tiles[t], {
      settlement: city.id,
      owner: 'p1',
      feature: null,
      improvement: null,
    });
    return t;
  };
  const done = [];
  const districts = [
    'district_campus',
    'district_holy_site',
    'district_theater',
    'district_commercial_hub',
    'district_industrial_zone',
    'district_encampment',
    'district_entertainment',
    'district_aqueduct',
    'district_government_plaza',
  ];
  for (const id of districts) {
    const t = land.shift();
    if (t === undefined) break;
    s.map.tiles[claim(t)].district = id;
    city.districts.push({ id, tile: t });
    done.push(id);
  }
  const wonders = [
    'wonder_pyramids',
    'wonder_hanging_gardens',
    'wonder_stonehenge',
    'wonder_temple_of_artemis',
    'wonder_oracle',
    'wonder_great_library',
    'wonder_colosseum',
    'wonder_petra',
  ];
  for (const id of wonders) {
    const t = land.shift();
    if (t === undefined) break;
    s.map.tiles[claim(t)].wonder = id;
    city.wonders.push(id);
    done.push(id);
  }
  if (sea.length > 0) {
    const t = claim(sea.shift());
    s.map.tiles[t].district = 'district_harbor';
    city.districts.push({ id: 'district_harbor', tile: t });
    done.push('district_harbor');
  }
  if (sea.length > 0) {
    const t = claim(sea.shift());
    s.map.tiles[t].wonder = 'wonder_colossus';
    city.wonders.push('wonder_colossus');
    done.push('wonder_colossus');
  }
  city.population = 9;
  game.load(s);
  window.cx.view.focusTile(city.tile, true);
  window.cx.view.dist = 9;
  return done;
});
console.log('placed:', placed.join(', '));
await page.keyboard.press('Escape');
await page.mouse.move(1270, 400);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/districts-3d.png` });
await page.evaluate(() => (window.cx.view.dist = 6));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/districts-3d-close.png` });
await page.click('.segmented.compact button:nth-child(2)');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/districts-2d.png` });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
