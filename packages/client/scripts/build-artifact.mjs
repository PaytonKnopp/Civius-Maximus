// Builds the client as one self-contained HTML file (JS and CSS inlined), for sharing as a page.
// Usage: node scripts/build-artifact.mjs <output.html>
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
if (!out) throw new Error('Usage: node scripts/build-artifact.mjs <output.html>');

execSync('pnpm exec vite build', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ARTIFACT: '1' },
});
const dist = join(root, 'dist-artifact');
const assets = readdirSync(join(dist, 'assets'));
// The page's bundle, and the AI worker's (inlined below as a blob URL the page picks up).
const worker = assets.filter((f) => f.startsWith('ai.worker') && f.endsWith('.js'));
const js = assets.filter((f) => f.endsWith('.js') && !worker.includes(f));
if (js.length !== 1) throw new Error(`Expected one JS bundle, got: ${js.join(', ')}`);
const workerSource = worker.map((f) => readFileSync(join(dist, 'assets', f), 'utf8'))[0];
const css = assets
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(dist, 'assets', f), 'utf8'));
const script = readFileSync(join(dist, 'assets', js[0]), 'utf8').replaceAll(
  '</script',
  '<\\/script',
);
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1];
const fonts = head.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]+>/)?.[0] ?? '';
const title = head.match(/<title>.*<\/title>/)[0];

const page = [
  '<meta charset="utf-8">',
  title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  fonts.replace(/\s+/g, ' '),
  `<style>\n${css.join('\n')}\n</style>`,
  '<div id="root"></div>',
  ...(workerSource
    ? [
        `<script>window.cxAiWorker = URL.createObjectURL(new Blob([${JSON.stringify(
          workerSource,
        ).replaceAll('</script', '<\\/script')}], { type: 'text/javascript' }));</script>`,
      ]
    : []),
  `<script type="module">\n${script}\n</script>`,
  '',
].join('\n');
writeFileSync(out, page);
console.log(`Wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
