// Plays the first turns of a local game in a real browser and screenshots each step:
// select a unit, preview a path, move, end turns, the 2D view, and phone size.
// Usage: node scripts/screenshot-game.mjs <out-dir>   (BASE_URL defaults to a vite preview)
import { chromium } from 'playwright';
const out = process.argv[2];
const url = process.env.BASE_URL ?? 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
};
const rendering = (page) =>
  page.waitForFunction(
    () => !/^0 fps/.test(document.querySelector('.fps')?.textContent ?? '0 fps'),
    null,
    { timeout: 30000 },
  );
const turn = (page) => page.textContent('.turn-number');

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
watch(page, 'desktop');
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas');
await rendering(page);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/game-start.png` });

// Next action selects the first unit that needs orders.
console.log('next action:', await page.textContent('.next-label'));
await page.keyboard.press('Enter');
await page.waitForSelector('.unit-panel');
console.log('selected:', (await page.textContent('.unit-head'))?.trim());
await page.mouse.move(640 + 190, 400 - 40);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/game-path.png` });

// Right-click moves there.
await page.mouse.click(640 + 190, 400 - 40, { button: 'right' });
await page.waitForTimeout(1500);
console.log('after move:', (await page.textContent('.unit-sub'))?.trim());
await page.screenshot({ path: `${out}/game-moved.png` });

// Skip everything else and end a few turns.
const before = await turn(page);
for (let i = 0; i < 12; i++) {
  const label = await page.textContent('.next-label');
  if (label === 'End turn') {
    await page.keyboard.press('Enter');
    break;
  }
  if (await page.$('.unit-panel')) await page.keyboard.press(' ');
  else await page.keyboard.press('Enter');
}
await page.waitForFunction(
  (t) => document.querySelector('.turn-number')?.textContent !== t,
  before,
);
console.log('turn', before, '->', await turn(page));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/game-turn2.png` });

// 2D view of the same game.
await page.click('.segmented.compact button:nth-child(2)');
await page.waitForTimeout(1500);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.mouse.move(640 + 120, 400 + 60);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/game-2d.png` });

// New game dialog.
await page.click('text=New game');
await page.waitForSelector('.dialog');
await page.screenshot({ path: `${out}/game-dialog.png` });
await page.click('text=Cancel');

const phone = await browser.newPage({
  viewport: { width: 400, height: 820 },
  isMobile: true,
  hasTouch: true,
});
watch(phone, 'phone');
await phone.goto(url, { waitUntil: 'networkidle' });
await phone.waitForSelector('canvas');
await rendering(phone);
await phone.waitForTimeout(1000);
await phone.click('.next-action');
await phone.waitForSelector('.unit-panel');
await phone.waitForTimeout(800);
await phone.screenshot({ path: `${out}/game-phone.png` });
const overflow = await phone.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);
console.log('phone horizontal overflow:', overflow);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
