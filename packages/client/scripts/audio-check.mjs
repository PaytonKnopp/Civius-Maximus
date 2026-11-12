// Measures the game's sound without ears (the release pass ran on a machine with no sound card):
// every effect cue alone, each era's music, the loudest pile-up, and what a stalled page does.
// The game's audio is synthesized, so the real thing is measured: the built game runs in a
// headless browser and its master bus is read sample by sample, before the output compressor and
// after an identical one.
//
//   pnpm build && pnpm --filter @cx/client exec vite preview --port 4173
//   node packages/client/scripts/audio-check.mjs [out.json]
//
// Prints a table and exits 1 if anything would clip (a peak at or over 0 dBFS after the
// compressor) or a cue makes no sound. It cannot say whether anything sounds good.
// Env: BASE_URL, MUSIC_SECONDS (how long each era is listened to, default 20).
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const out = process.argv[2];
const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const MUSIC_SECONDS = Number(process.env.MUSIC_SECONDS ?? 20);

const CUES = [
  'click',
  'open',
  'close',
  'select',
  'select_civilian',
  'move',
  'move_horse',
  'move_ship',
  'found',
  'build',
  'buy',
  'research',
  'civic',
  'boost',
  'grow',
  'border',
  'melee',
  'ranged',
  'gun',
  'cannon',
  'killed',
  'captured',
  'promote',
  'war',
  'peace',
  'deal',
  'wonder',
  'great_person',
  'religion',
  'government',
  'era',
  'turn',
  'end_turn',
  'notify',
  'error',
  'gold',
  'burning',
  'victory',
  'defeat',
];

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined),
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.setItem('cx.hints.off', '1');
  localStorage.removeItem('cx-audio');
});
await page.goto(`${base}#play`);
await page.waitForSelector('.game', { timeout: 120_000 });
// The first gesture starts sound, as for a player.
await page.mouse.click(640, 400);
await page.waitForFunction(() => window.cxAudio?.audio?.ctx?.state === 'running', null, {
  timeout: 20_000,
});

// Meters on the master bus: `pre` is what reaches the game's compressor, `post` the same signal
// through a compressor set like the game's (engine.ts), which is what reaches the speakers.
await page.evaluate(() => {
  const { audio } = window.cxAudio;
  const ctx = audio.ctx;
  const meter = () => ({ peak: 0, sum: 0, n: 0, last: 0 });
  const m = { pre: meter(), post: meter() };
  const tap = (node, into) => {
    const p = ctx.createScriptProcessor(2048, 2, 2);
    p.onaudioprocess = (e) => {
      let peak = 0;
      let sum = 0;
      for (let c = 0; c < 2; c++) {
        const d = e.inputBuffer.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const v = Math.abs(d[i]);
          if (v > peak) peak = v;
          sum += v * v;
        }
      }
      const mm = m[into];
      if (peak > mm.peak) mm.peak = peak;
      mm.sum += sum;
      mm.n += e.inputBuffer.length * 2;
      mm.last = Math.sqrt(sum / (e.inputBuffer.length * 2));
    };
    node.connect(p);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    p.connect(mute).connect(ctx.destination);
  };
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  audio.master.connect(comp);
  tap(audio.master, 'pre');
  tap(comp, 'post');
  window.__meters = m;
  window.__resetMeters = () => {
    for (const k of ['pre', 'post']) Object.assign(m[k], meter());
  };
  window.__readMeters = () => ({
    pre: { peak: m.pre.peak, rms: Math.sqrt(m.pre.sum / Math.max(1, m.pre.n)), last: m.pre.last },
    post: {
      peak: m.post.peak,
      rms: Math.sqrt(m.post.sum / Math.max(1, m.post.n)),
      last: m.post.last,
    },
  });
});

const db = (v) => (v <= 0 ? -120 : 20 * Math.log10(v));
const fmt = (v) => `${db(v) >= 0 ? '+' : ''}${db(v).toFixed(1)}`.padStart(6);
const wait = (ms) => page.waitForTimeout(ms);
const read = () => page.evaluate(() => window.__readMeters());
const reset = () => page.evaluate(() => window.__resetMeters());
/** Waits until the bus is quiet (below -66 dBFS) or `max` ms; returns how long it took. */
async function untilQuiet(max) {
  const started = Date.now();
  await wait(250);
  while (Date.now() - started < max) {
    const r = await read();
    if (r.pre.last < 0.0005) break;
    await wait(100);
  }
  return Date.now() - started;
}

const report = { cues: [], music: [], stack: null, stall: null, clock: null };

// The audio clock must run in real time for any of this to mean something.
{
  const t0 = await page.evaluate(() => window.cxAudio.audio.ctx.currentTime);
  await wait(1000);
  const t1 = await page.evaluate(() => window.cxAudio.audio.ctx.currentTime);
  report.clock = t1 - t0;
  console.log(`audio clock: ${(t1 - t0).toFixed(2)} s in 1.00 s of real time`);
}

// --- Each cue alone, at the default volumes, with the music and ambience silenced -------------
await page.evaluate(() => {
  const { audio, music } = window.cxAudio;
  music.stop();
  audio.set({ music: 0, ambience: 0 });
});
await wait(4000);
await untilQuiet(8000);
console.log('\nEffect cues alone (dBFS; effects 70%, master 80%: the defaults)');
console.log('cue               peak in  peak out   rms    length');
for (const cue of CUES) {
  await reset();
  await page.evaluate((c) => window.cxAudio.play(c), cue);
  const ms = await untilQuiet(9000);
  const r = await read();
  report.cues.push({ cue, pre: r.pre.peak, post: r.post.peak, rms: r.pre.rms, ms });
  console.log(
    `${cue.padEnd(17)} ${fmt(r.pre.peak)}   ${fmt(r.post.peak)}  ${fmt(r.pre.rms)}  ${(ms / 1000).toFixed(1)} s`,
  );
  await wait(150);
}

// --- Music by era -------------------------------------------------------------------------------
console.log(`\nMusic by era (${MUSIC_SECONDS} s each; music 45%, ambience 35%: the defaults)`);
console.log('era  culture         peak in  peak out   rms');
await page.evaluate(() => {
  const { audio, music } = window.cxAudio;
  audio.set({ music: 0.45, ambience: 0.35 });
  music.start();
});
// A piece only changes with the era, so each entry is a different era from the one before.
// Eras past the sixth share its style; the early eras take a color from the civ's culture.
const ERAS = [
  [2, 'mediterranean'],
  [1, 'east_asian'],
  [2, 'middle_eastern'],
  [3, 'northern'],
  [4, 'mediterranean'],
  [5, 'mediterranean'],
  [6, 'mediterranean'],
  [1, 'mediterranean'],
  [3, 'mediterranean'],
];
for (const [era, arch] of ERAS) {
  await page.evaluate(([e, a]) => window.cxAudio.music.setEra(e, a), [era, arch]);
  // A new era starts its piece after a breath of about three seconds.
  await wait(4500);
  await reset();
  await wait(MUSIC_SECONDS * 1000);
  const r = await read();
  report.music.push({ era, arch, pre: r.pre.peak, post: r.post.peak, rms: r.pre.rms });
  console.log(
    `${String(era).padEnd(4)} ${arch.padEnd(15)} ${fmt(r.pre.peak)}   ${fmt(r.post.peak)}  ${fmt(r.pre.rms)}`,
  );
}

// --- The loudest moment: music playing and the big cues at once -------------------------------
await reset();
await page.evaluate(() => {
  const { play } = window.cxAudio;
  for (const c of ['wonder', 'victory', 'cannon', 'war', 'era', 'great_person', 'captured'])
    play(c);
});
await wait(6000);
{
  const r = await read();
  report.stack = { pre: r.pre.peak, post: r.post.peak, rms: r.pre.rms };
  console.log(
    `\nSeven big cues at once over the music: peak in ${fmt(r.pre.peak)}, peak out ${fmt(r.post.peak)} dBFS`,
  );
}

// --- A stalled page: the music must carry on from now, not play what it missed all at once ----
await untilQuiet(1);
await reset();
await wait(8000);
const normal = await read();
await page.evaluate(() => {
  const end = performance.now() + 9000;
  while (performance.now() < end);
});
await reset();
await wait(5000);
{
  const r = await read();
  report.stall = { normalPeak: normal.post.peak, afterPeak: r.post.peak, afterIn: r.pre.peak };
  console.log(
    `After the page froze for 9 s: peak out ${fmt(r.post.peak)} dBFS (in ${fmt(r.pre.peak)}); the 8 s before: ${fmt(normal.post.peak)}`,
  );
}

await browser.close();
if (out) writeFileSync(out, JSON.stringify(report, null, 2));

const problems = [];
if (Math.abs(report.clock - 1) > 0.25) problems.push('the audio clock did not run in real time');
for (const c of report.cues) {
  if (c.pre < 0.001) problems.push(`cue ${c.cue} made no sound`);
  if (c.post >= 1) problems.push(`cue ${c.cue} clips alone`);
}
for (const m of report.music) if (m.post >= 1) problems.push(`era ${m.era} music clips`);
if (report.stack.post >= 1) problems.push('the big cues together clip');
if (report.stall.afterPeak >= 1) problems.push('the music clips after a stall');
for (const e of errors) problems.push(`page error: ${e}`);
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join('\n- ')}` : '\nNo clipping found.');
process.exit(problems.length ? 1 : 0);
