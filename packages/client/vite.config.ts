import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// ARTIFACT=1 builds one self-contained page (no code splitting) that scripts/build-artifact.mjs
// inlines into a single HTML file for sharing.
const artifact = process.env.ARTIFACT === '1';

export default defineConfig({
  plugins: [react()],
  build: artifact
    ? {
        outDir: 'dist-artifact',
        assetsInlineLimit: 100_000_000,
        chunkSizeWarningLimit: 4000,
        rollupOptions: { output: { inlineDynamicImports: true } },
      }
    : { chunkSizeWarningLimit: 1500 },
});
