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
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(process.env.BASE_URL ?? 'http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => /\d+ ms/.test(document.querySelector('.bar-stats')?.textContent ?? ''),
  null,
  { timeout: 30000 },
);
await page.waitForTimeout(2500);
await page.click('.panel-toggle');
await page.screenshot({ path: `${out}/3d-medium.png` });

await page.click('.panel-toggle');
await page.selectOption('#viewer', 'p1');
await page.waitForTimeout(2500);
await page.click('.panel-toggle');
await page.screenshot({ path: `${out}/3d-fog.png` });
await page.click('.panel-toggle');
await page.selectOption('#viewer', '');
await page.selectOption('#quality', 'high');
await page.waitForTimeout(4000);
await page.click('.panel-toggle');
await page.mouse.move(640, 400);
await page.mouse.wheel(0, -500);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/3d-high.png` });
await page.click('.panel-toggle');
await page.selectOption('#quality', 'medium');
await page.waitForTimeout(3000);
await page.click('.panel-toggle');
await page.mouse.move(640, 400);
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 900);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/3d-far.png` });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
