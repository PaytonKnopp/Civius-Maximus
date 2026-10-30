// Plays an online game between two tabs of one browser (the same-browser network, `?net=local`):
// the host opens a lobby, a friend joins with the code, both found a capital and end the turn,
// then the friend leaves and the host ends their turn for them. Screenshots each step and checks
// the friend's tab never holds the real game's dice or seed.
// Usage: node scripts/screenshot-online.mjs <out-dir>   (BASE_URL defaults to a vite preview)
import { chromium } from 'playwright';
const out = process.argv[2];
const base = `${process.env.BASE_URL ?? 'http://localhost:4173/'}?net=local&debug`;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const errors = [];
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.stack ?? e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
};
const turn = (page) => page.evaluate(() => window.cx.game.state.turn);
const waitTurn = (page, n) =>
  page.waitForFunction((n) => window.cx?.game.state.turn === n, n, { timeout: 60000 });

// The host opens a lobby.
const host = await context.newPage();
watch(host, 'host');
await host.goto(base, { waitUntil: 'networkidle' });
await host.click('button:has-text("Play online")');
await host.fill('#online-name', 'Ann');
await host.selectOption('#online-size', 'tiny');
await host.selectOption('#online-rivals', '1');
await host.click('button:has-text("Open the lobby")');
await host.waitForSelector('.join-code');
const code = (await host.textContent('.join-code')).trim();
console.log('code:', code);

// A friend joins with the invite link.
const guest = await context.newPage();
watch(guest, 'guest');
await guest.goto(`${base}#join=${code}`, { waitUntil: 'networkidle' });
await guest.fill('#online-name', 'Bo');
await guest.click('.dialog-actions button:has-text("Join")');
await guest.waitForSelector('.lobby .seats li:has-text("Bo")');
await host.waitForSelector('.lobby .seats li:has-text("Bo")');
await host.screenshot({ path: `${out}/online-lobby-host.png` });
await guest.screenshot({ path: `${out}/online-lobby-guest.png` });
console.log(
  'lobby:',
  (await host.$$eval('.lobby .seats li', (l) => l.map((x) => x.textContent))).join(', '),
);

// Start: both get the game.
await host.click('button:has-text("Start the game")');
for (const page of [host, guest]) {
  await page.waitForSelector('.online-chip');
  await page.waitForFunction(() => window.cx?.game.state, null, { timeout: 30000 });
}
const secrets = await guest.evaluate(() => ({
  rng: window.cx.game.state.rng,
  seed: window.cx.game.state.settings.seed,
  units: Object.values(window.cx.game.state.units).length,
}));
const hostUnits = await host.evaluate(() => Object.values(window.cx.game.state.units).length);
console.log('guest holds:', JSON.stringify(secrets), `(host has ${hostUnits} units in all)`);

// Each founds a capital and ends the turn.
for (const page of [host, guest]) {
  await page.waitForFunction(
    () => /need/.test(document.querySelector('.next-label')?.textContent ?? ''),
    null,
    { timeout: 60000 },
  );
  // Each player's leader intro opens the game.
  await page.waitForSelector('.leader-intro');
  await page.click('.leader-intro .primary');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.unit-panel');
  await page.keyboard.press('b');
  await page.waitForSelector('.settlement-panel');
  await page.waitForTimeout(800);
}
await host.screenshot({ path: `${out}/online-game-host.png` });
await guest.screenshot({ path: `${out}/online-game-guest.png` });
for (const page of [guest, host])
  await page.evaluate(() =>
    window.cx.game.act({ type: 'end_turn', player: window.cx.game.humans()[0] }),
  );
await waitTurn(host, 2);
await waitTurn(guest, 2);
console.log('turns:', await turn(host), await turn(guest));

// The friend leaves; the host sees it and ends their turn for them.
await guest.close();
await host.waitForSelector('.online-bar:has-text("Bo is away")');
await host.screenshot({ path: `${out}/online-away.png` });
await host.click('.online-bar button:has-text("End their turn")');
await host.evaluate(() => window.cx.game.act({ type: 'end_turn', player: 'p1' }));
await waitTurn(host, 3);
console.log('host turn after the friend left:', await turn(host));

// Phone size: the lobby dialog fits. (The host's game is done: closing it leaves the software
// renderer to the phone page, which otherwise can take longer than a click waits.)
await host.close();
const phone = await browser.newPage({ viewport: { width: 400, height: 820 }, isMobile: true });
watch(phone, 'phone');
await phone.goto(base, { waitUntil: 'networkidle' });
await phone.click('button:has-text("Play online")');
await phone.click('button:has-text("Open the lobby")');
await phone.waitForSelector('.join-code');
await phone.screenshot({ path: `${out}/online-lobby-phone.png` });
console.log(
  'phone horizontal overflow:',
  await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
