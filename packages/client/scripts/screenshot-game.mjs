// Plays the first turns of a local game in a real browser and screenshots each step: select the
// settler, found a capital, pick production, grow and develop a tile, the 2D view, phone size.
// Usage: node scripts/screenshot-game.mjs <out-dir>   (BASE_URL defaults to a vite preview)
import { chromium } from 'playwright';
const out = process.argv[2];
const url = `${process.env.BASE_URL ?? 'http://localhost:4173/'}#play`;
const TURNS = Number(process.env.TURNS ?? 14);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.stack ?? e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
};
const rendering = (page) =>
  page.waitForFunction(
    () => !/^0 fps/.test(document.querySelector('.fps')?.textContent ?? '0 fps'),
    null,
    { timeout: 30000 },
  );
const turn = async (page) => Number(await page.textContent('.turn-number'));
const label = (page) => page.textContent('.next-label');

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
watch(page, 'desktop');
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas');
await rendering(page);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/game-start.png` });

// The first unit is the settler: found the capital where it stands.
await page.keyboard.press('Enter');
await page.waitForSelector('.unit-panel');
console.log('selected:', (await page.textContent('.unit-head h3'))?.trim());
await page.screenshot({ path: `${out}/game-settler.png` });
await page.keyboard.press('b');
await page.waitForSelector('.settlement-panel');
console.log('founded:', (await page.textContent('.settlement-head h3'))?.trim());
await page.click('.items li:has-text("Warrior") button:has-text("Build")');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/game-founded.png` });

// Play turns: skip units, take growth choices, keep building, end the turn.
let developShot = false;
const shots = new Set();
for (let guard = 0; guard < TURNS * 15 && (await turn(page)) < TURNS; guard++) {
  const next = await label(page);
  if (next === 'End turn') {
    await page.keyboard.press('Enter');
  } else if (next === 'Choose a tile to develop') {
    await page.keyboard.press('Enter');
    await page.waitForSelector('.develop .choices button');
    if (!developShot) {
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}/game-develop.png` });
      developShot = true;
    }
    console.log('develop:', (await page.textContent('.develop .choices button'))?.trim());
    await page.click('.develop .choices button');
  } else if (next === 'Choose production') {
    await page.keyboard.press('Enter');
    await page.waitForSelector('.items li');
    // Place a district when one is available (once), otherwise build the first thing.
    const place = await page.$(
      '.item-group:has(h5:has-text("Districts")) button:has-text("Place")',
    );
    if (place && !shots.has('place')) {
      await place.click();
      await page.waitForSelector('.placement .choices button');
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}/game-place.png` });
      shots.add('place');
      console.log('place:', (await page.textContent('.placement .choices button'))?.trim());
      await page.click('.placement .choices button');
    } else {
      await page.click('.items li button:has-text("Build")');
    }
  } else if (next === 'Choose research' || next === 'Choose a civic') {
    await page.keyboard.press('Enter');
    await page.waitForSelector('.tree-node.available');
    const tree = next === 'Choose research' ? 'tech' : 'civic';
    // Aim a few steps ahead, so the path queues up.
    // (Writing first, for the Campus.)
    const target =
      (tree === 'tech' &&
        (await page.$('.tree-node:not(.done):has(.node-name:text-is("Writing"))'))) ||
      (await page.$('.tree-node.locked')) ||
      (await page.$('.tree-node.available'));
    await target.click();
    if (!shots.has(tree)) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/game-${tree}-tree.png` });
      shots.add(tree);
    }
    console.log(`${tree}:`, (await page.textContent('.screen-sub'))?.trim());
    await page.keyboard.press('Escape');
  } else if (next === 'Choose policies') {
    await page.keyboard.press('Enter');
    await page.waitForSelector('.card-pool');
    const cards = await page.$$('.card-pool .policy-card');
    for (const c of cards.slice(0, 2)) await c.click();
    if (!shots.has('gov')) {
      await page.screenshot({ path: `${out}/game-government.png` });
      shots.add('gov');
    }
    const confirm = await page.$('.gov-confirm .primary:not([disabled])');
    if (confirm) await confirm.click();
    console.log(
      'policies:',
      (
        await page.$$eval('.policy-card.slotted .card-name', (n) => n.map((x) => x.textContent))
      ).join(', '),
    );
    await page.keyboard.press('Escape');
  } else if (next === 'Rivals are moving…') {
    // The AI plays in a background worker: wait for it (it doesn't count as a step).
    await page.waitForFunction(
      () => document.querySelector('.next-label')?.textContent !== 'Rivals are moving…',
      null,
      { timeout: 60000 },
    );
    guard--;
  } else if (/need/.test(next ?? '')) {
    await page.keyboard.press('Enter');
    await page.waitForSelector('.unit-panel');
    await page.keyboard.press(' ');
  } else {
    await page.waitForTimeout(100);
  }
}
console.log('turn reached:', await turn(page));
console.log('empire:', (await page.textContent('.resource-bar'))?.replace(/\s+/g, ' '));
// Open the capital to look at it.
await page.keyboard.press('Escape');
await page.mouse.move(640, 400);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/game-later.png` });

// 2D view of the same game.
await page.click('.segmented.compact button:nth-child(2)');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/game-2d.png` });

const phone = await browser.newPage({
  viewport: { width: 400, height: 820 },
  isMobile: true,
  hasTouch: true,
});
watch(phone, 'phone');
await phone.goto(url, { waitUntil: 'networkidle' });
await phone.waitForSelector('canvas');
await rendering(phone);
await phone.waitForTimeout(800);
await phone.click('.next-action');
await phone.waitForSelector('.unit-panel');
await phone.click('.unit-actions .found');
await phone.waitForSelector('.settlement-panel');
await phone.waitForTimeout(800);
await phone.screenshot({ path: `${out}/game-phone.png` });
const overflow = await phone.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);
console.log('phone horizontal overflow:', overflow);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
