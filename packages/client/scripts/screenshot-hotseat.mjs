// Plays a 2-player hotseat game for a few turns (pass screen, turn summary), then saves and
// loads it. Usage: node scripts/screenshot-hotseat.mjs <out-dir>   (BASE_URL: a vite preview)
import { chromium } from 'playwright';
const out = process.argv[2];
const url = `${process.env.BASE_URL ?? 'http://localhost:4173/'}#play`;
const TURNS = Number(process.env.TURNS ?? 4);
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

// New game: two humans and one AI rival on a small map.
await page.click('button:has-text("New game")');
await page.click('button:has-text("Add a player")');
await page.fill('input[aria-label="Player 1 name"]', 'Ada');
await page.fill('input[aria-label="Player 2 name"]', 'Bo');
await page.fill('#ng-rivals', '1');
await page.selectOption('#ng-limit', '60');
await page.screenshot({ path: `${out}/hotseat-setup.png` });
await page.click('button:has-text("Start game")');
await page.waitForSelector('.pass-screen');
await page.screenshot({ path: `${out}/hotseat-pass.png` });
console.log('pass:', (await page.textContent('.pass-card'))?.replace(/\s+/g, ' '));

const label = () => page.textContent('.next-label');
/** One player's turn: answer every prompt, then end the turn. */
async function playTurn(who) {
  await page.keyboard.press('Enter'); // take the device
  await page.waitForSelector('.pass-screen', { state: 'detached' });
  if (await page.$('.turn-summary')) {
    console.log(`${who} summary:`, (await page.textContent('.turn-summary ul'))?.slice(0, 200));
    await page.click('.turn-summary .close');
  }
  for (let guard = 0; guard < 40; guard++) {
    const next = await label();
    if (next === 'End turn') {
      await page.keyboard.press('Enter');
      return;
    }
    if (/units? needs? orders/.test(next ?? '')) {
      await page.keyboard.press('Enter');
      await page.waitForSelector('.unit-panel');
      if (await page.$('.unit-actions .found:not([disabled])')) await page.keyboard.press('b');
      else await page.keyboard.press(' ');
    } else if (next === 'Choose production') {
      await page.keyboard.press('Enter');
      await page.click('.items li button:has-text("Build")');
    } else if (next === 'Choose a tile to develop') {
      await page.keyboard.press('Enter');
      await page.click('.develop .choices button');
    } else if (next === 'Choose research' || next === 'Choose a civic') {
      await page.keyboard.press('Enter');
      await page.click('.tree-node.available');
      await page.keyboard.press('Escape');
    } else if (next === 'Choose policies') {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
    } else {
      await page.waitForTimeout(100);
    }
  }
  throw new Error(`${who} never reached End turn (stuck on "${await label()}")`);
}

for (let t = 1; t <= TURNS; t++) {
  for (const who of ['Ada', 'Bo']) {
    await page.waitForSelector('.pass-screen');
    const card = (await page.textContent('.pass-card'))?.replace(/\s+/g, ' ');
    if (!card?.includes(who)) throw new Error(`expected ${who}'s pass screen, got: ${card}`);
    await playTurn(who);
    if (t === 2 && who === 'Bo') await page.screenshot({ path: `${out}/hotseat-bo.png` });
  }
}
await page.waitForSelector('.pass-screen');
console.log('turn after loop:', (await page.textContent('.pass-turn'))?.trim());
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
if (await page.$('.turn-summary')) {
  await page.screenshot({ path: `${out}/hotseat-summary.png` });
  await page.click('.turn-summary .close');
}

// Save, then load it back.
await page.click('button:has-text("Save / Load")');
await page.fill('input[aria-label="Save name"]', 'Hotseat test');
await page.click('button:has-text("Save game")');
await page.waitForSelector('.save-list li:has-text("Hotseat test")');
await page.screenshot({ path: `${out}/hotseat-saves.png` });
console.log('saves:', (await page.textContent('.save-list'))?.replace(/\s+/g, ' '));
await page.click('.save-list li:has-text("Hotseat test") button:has-text("Load")');
await page.waitForSelector('.pass-screen');
console.log('after load:', (await page.textContent('.pass-card'))?.replace(/\s+/g, ' '));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
