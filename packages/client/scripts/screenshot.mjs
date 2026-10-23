import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(process.env.BASE_URL ?? 'http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForFunction(
  () => /\d+ ms/.test(document.querySelector('.bar-stats')?.textContent ?? ''),
  null,
  { timeout: 15000 },
);
await page.waitForFunction(
  () => !/^0 fps/.test(document.querySelector('.fps')?.textContent ?? '0 fps'),
  null,
  { timeout: 15000 },
);
await page.mouse.move(700, 420);
await page.screenshot({ path: `${out}/lab-desktop.png` });
console.log('stats:', await page.textContent('.bar-stats'));
console.log('card:', (await page.textContent('.tile-card').catch(() => 'none'))?.slice(0, 200));
// drag + zoom
await page.mouse.down();
await page.mouse.move(400, 300, { steps: 10 });
await page.mouse.up();
await page.mouse.wheel(0, -600);
await page.check('#yields');
await page.screenshot({ path: `${out}/lab-zoomed.png` });
const phone = await browser.newPage({
  viewport: { width: 400, height: 820 },
  isMobile: true,
  hasTouch: true,
});
phone.on('pageerror', (e) => errors.push(`phone pageerror: ${e.message}`));
await phone.goto(process.env.BASE_URL ?? 'http://localhost:4173/', { waitUntil: 'networkidle' });
await phone.waitForSelector('canvas');
await phone.waitForTimeout(1500);
await phone.screenshot({ path: `${out}/lab-phone.png` });
const overflow = await phone.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);
console.log('phone horizontal overflow:', overflow);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
