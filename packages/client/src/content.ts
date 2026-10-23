import { type CompiledContent, compileContent, formatDiagnostic, type RawFile } from '@cx/content';

// The base game's content files, bundled at build time. Mods will be loaded at runtime later.
const files = import.meta.glob('../../content/base/**/*.json', { eager: true, import: 'default' });

function basePackage() {
  const prefix = '../../content/base/';
  const raw: RawFile[] = [];
  let manifest: unknown = null;
  for (const [path, data] of Object.entries(files)) {
    const rel = path.slice(prefix.length);
    if (rel === 'mod.json') manifest = data;
    else raw.push({ path: rel, data });
  }
  return { source: 'base', manifest, files: raw };
}

let cached: CompiledContent | undefined;

/** The compiled base content. Throws with every problem listed if the bundled content is broken. */
export function loadContent(): CompiledContent {
  if (cached) return cached;
  const result = compileContent([basePackage()]);
  if (!result.content) {
    throw new Error(
      `Base content is invalid:\n${result.diagnostics.map(formatDiagnostic).join('\n')}`,
    );
  }
  cached = result.content;
  return cached;
}
