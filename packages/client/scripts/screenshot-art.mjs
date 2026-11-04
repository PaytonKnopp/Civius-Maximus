// Close-ups for judging art: terrain and trees, a town's roofs and walls, figures. High quality.
// Usage: node scripts/screenshot-art.mjs <out-dir>   (needs `vite preview --port 4173`)
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
await page.goto(`${process.env.BASE_URL ?? 'http://localhost:4173/'}#lab`, {
  waitUntil: 'networkidle',
});
await page.waitForFunction(
  () => /\d+ ms/.test(document.querySelector('.bar-stats')?.textContent ?? ''),
  null,
  { timeout: 30000 },
);
await page.waitForTimeout(2500);
const quality = process.env.QUALITY ?? 'high';
// The controls panel starts open.
await page.selectOption('#quality', quality);
await page.waitForTimeout(3000);
const shot = async (name, wait = 2500) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const zoom = async (dy) => {
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, dy);
};

// Towns of every style, then zoom right in on one.
await page.check('#towns');
await page.click('.starts li:first-child button');
await page.waitForTimeout(1500);
await page.click('.controls-toggle');
await zoom(-900);
await shot('art-town-close', 3000);
await zoom(-500);
await shot('art-town-closer', 2500);
await zoom(-700);
await shot('art-town-closest', 2500);

// Figures close up.
await page.click('.controls-toggle');
await page.uncheck('#towns');
await page.check('#models');
await page.click('.starts li:first-child button');
await page.waitForTimeout(1500);
await page.click('.controls-toggle');
await zoom(-1400);
await shot('art-figures-close', 3000);
await zoom(-400);
await shot('art-figures-closer', 2500);
await zoom(-900);
await shot('art-figures-closest', 2500);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
