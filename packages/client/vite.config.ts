import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// ARTIFACT=1 builds one self-contained page (no code splitting) that scripts/build-artifact.mjs
// inlines into a single HTML file for sharing.
const artifact = process.env.ARTIFACT === '1';

// Which build this is (src/update.ts): the commit on GitHub, else the time. Every build also
// publishes it as version.json, so an open game can tell that a newer one is out.
const build = {
  id: process.env.GITHUB_SHA?.slice(0, 12) ?? `local-${Date.now().toString(36)}`,
  at: new Date().toISOString(),
};

const versionFile = (): Plugin => ({
  name: 'cx-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(build) });
  },
});

export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(build.id),
    'import.meta.env.VITE_BUILD_AT': JSON.stringify(build.at),
  },
  // Relative asset paths, so the build works at a sub-path (GitHub Pages serves the game at
  // /<repo>/) as well as at the root.
  base: './',
  build: artifact
    ? {
        outDir: 'dist-artifact',
        assetsInlineLimit: 100_000_000,
        chunkSizeWarningLimit: 4000,
        rollupOptions: { output: { inlineDynamicImports: true } },
      }
    : { chunkSizeWarningLimit: 1500 },
});
