import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawFile, RawPackage } from '../compile';

/** Folder holding the base game's content package. */
export const BASE_CONTENT_DIR = fileURLToPath(new URL('../../base', import.meta.url));

function listJson(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listJson(full));
    else if (name.endsWith('.json')) out.push(full);
  }
  return out;
}

function readJson(path: string): { data?: unknown; parseError?: string } {
  try {
    return { data: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (e) {
    return { parseError: e instanceof Error ? e.message : String(e) };
  }
}

/** Reads a content package folder: `mod.json` plus every other `.json` file under it. */
export function readPackageDir(dir: string): RawPackage {
  const source = dir.split(sep).filter(Boolean).pop() ?? dir;
  const manifestPath = join(dir, 'mod.json');
  const manifest = readJson(manifestPath);
  const files: RawFile[] = [];
  if (manifest.parseError !== undefined) {
    files.push({ path: 'mod.json', parseError: manifest.parseError });
  }
  for (const full of listJson(dir)) {
    if (full === manifestPath) continue;
    const path = relative(dir, full).split(sep).join('/');
    files.push({ path, ...readJson(full) });
  }
  return { source, manifest: manifest.data ?? null, files };
}
