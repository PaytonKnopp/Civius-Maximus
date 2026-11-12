import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { keyProblem } from './src/cloud/cloud';
import { formatVersion } from './src/version';

// ARTIFACT=1 builds one self-contained page (no code splitting) that scripts/build-artifact.mjs
// inlines into a single HTML file for sharing.
const artifact = process.env.ARTIFACT === '1';

// Which build this is (src/update.ts): the commit on GitHub, else the time. Every build also
// publishes it as version.json, so an open game can tell that a newer one is out.
// The number people see (1.0, 1.01 …) counts the merges on main (src/version.ts); builds
// outside a git checkout with history just show 1.0.
function mergesOnMain(): number {
  try {
    return Number(
      execSync('git rev-list --count --first-parent HEAD', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    );
  } catch {
    return 0;
  }
}

const build = {
  id: process.env.GITHUB_SHA?.slice(0, 12) ?? `local-${Date.now().toString(36)}`,
  at: new Date().toISOString(),
  version: formatVersion(mergesOnMain()),
};

const versionFile = (): Plugin => ({
  name: 'cx-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(build) });
  },
});

/**
 * Whatever is in VITE_SUPABASE_ANON_KEY is written into the JavaScript every player downloads,
 * so it must be the public key. The secret one (sb_secret_…, or a legacy key whose role is
 * service_role) skips every database rule: stop the build rather than publish it. (The game
 * also refuses to use such a key, but by then it would already be in the file.)
 */
function refuseSecretKey(mode: string) {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_');
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  const problem = key ? keyProblem(key) : undefined;
  if (problem)
    throw new Error(
      `VITE_SUPABASE_ANON_KEY can't go in a build. ${problem} If a build with it was ever published, replace that key in the Supabase dashboard.`,
    );
}

export default defineConfig(({ mode }) => {
  refuseSecretKey(mode);
  return {
    plugins: [react(), versionFile()],
    define: {
      'import.meta.env.VITE_BUILD_ID': JSON.stringify(build.id),
      'import.meta.env.VITE_BUILD_AT': JSON.stringify(build.at),
      'import.meta.env.VITE_VERSION': JSON.stringify(build.version),
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
  };
});
