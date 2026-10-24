import { type Diagnostic, formatPath, friendlyIssues, type PathSegment } from './diagnostics';
import { contentHash } from './hash';
import { applyPatch } from './patch';
import { collectRefs } from './refs';
import {
  type AnyEntity,
  ENTITY_SCHEMAS,
  ENTITY_TYPES,
  type EntityByType,
  type EntityType,
  FILE_ENTRY_SCHEMAS,
  type FileEntryType,
  type PatchDef,
} from './schema/entities';
import { Manifest } from './schema/manifest';

export const CONTENT_FORMAT_VERSION = 1;

/** A content package as read from disk (or uploaded), before validation. */
export interface RawPackage {
  /** Where it came from, for messages when the manifest is unreadable (e.g. a folder name). */
  source: string;
  manifest: unknown;
  files: RawFile[];
}

export interface RawFile {
  /** Path inside the package, with forward slashes. */
  path: string;
  data?: unknown;
  /** Set when the file isn't valid JSON. */
  parseError?: string;
}

export interface CompiledContent {
  formatVersion: typeof CONTENT_FORMAT_VERSION;
  /** Packages in load order. */
  packages: { id: string; name: string; version: string; hash: string }[];
  /** Hash of everything below. Games store it so they always load the content they started with. */
  hash: string;
  entities: { [T in EntityType]: Record<string, EntityByType[T]> };
  /** Entity IDs per type, sorted, for deterministic iteration. */
  ids: { [T in EntityType]: string[] };
  rules: EntityByType['rules'];
  strings: Record<string, Record<string, string>>;
}

export interface CompileResult {
  /** Present when there are no errors (warnings are fine). */
  content?: CompiledContent;
  diagnostics: Diagnostic[];
}

interface Origin {
  package: string;
  file: string;
  path: PathSegment[];
}

interface Stored {
  type: EntityType;
  value: AnyEntity;
  origin: Origin;
  patchedBy: string[];
}

const BASE_ID = 'base';

/**
 * Validates and merges content packages (the base game is one of them) into compiled content.
 * Never throws on bad content: every problem becomes a diagnostic with a file and location.
 */
export function compileContent(raw: readonly RawPackage[]): CompileResult {
  const diagnostics: Diagnostic[] = [];
  const error = (origin: Partial<Origin> & { package: string }, message: string) =>
    diagnostics.push({
      severity: 'error',
      package: origin.package,
      ...(origin.file !== undefined && { file: origin.file }),
      ...(origin.path !== undefined && origin.path.length > 0 && { path: formatPath(origin.path) }),
      message,
    });

  // 1. Manifests.
  const packages: { manifest: Manifest; raw: RawPackage }[] = [];
  for (const pkg of raw) {
    const parsed = Manifest.safeParse(pkg.manifest, { reportInput: true });
    if (!parsed.success) {
      for (const i of friendlyIssues(parsed.error.issues, pkg.manifest)) {
        error({ package: pkg.source, file: 'mod.json', path: i.path }, i.message);
      }
      continue;
    }
    if (packages.some((p) => p.manifest.id === parsed.data.id)) {
      error(
        { package: parsed.data.id, file: 'mod.json' },
        `two packages use the id "${parsed.data.id}"`,
      );
      continue;
    }
    packages.push({ manifest: parsed.data, raw: pkg });
  }

  // 2. Load order.
  const ordered = loadOrder(packages, error);

  // 3. Entries, package by package. A package's patches apply after its own entities, so they
  //    can change anything loaded before them (including their own content).
  const store = new Map<string, Stored>();
  const strings: Record<string, Record<string, string>> = {};

  for (const { manifest, raw: pkg } of ordered) {
    const patches: { patch: PatchDef; origin: Origin }[] = [];
    const files = [...pkg.files].sort((a, b) => (a.path < b.path ? -1 : 1));
    for (const file of files) {
      if (file.parseError !== undefined) {
        error(
          { package: manifest.id, file: file.path },
          `not valid JSON: ${file.parseError.split('\n')[0]}`,
        );
        continue;
      }
      const list = Array.isArray(file.data) ? file.data : [file.data];
      list.forEach((entry, index) => {
        const origin: Origin = {
          package: manifest.id,
          file: file.path,
          path: Array.isArray(file.data) ? [index] : [],
        };
        const type = entryType(entry);
        if (type === undefined) {
          error(
            origin,
            `needs a "type": one of ${Object.keys(FILE_ENTRY_SCHEMAS)
              .map((t) => `"${t}"`)
              .join(', ')}`,
          );
          return;
        }
        if (!(type in FILE_ENTRY_SCHEMAS)) {
          error(
            { ...origin, path: [...origin.path, 'type'] },
            `unknown type "${type}" (expected one of ${Object.keys(FILE_ENTRY_SCHEMAS).join(', ')})`,
          );
          return;
        }
        const schema = FILE_ENTRY_SCHEMAS[type as FileEntryType];
        const parsed = schema.safeParse(entry, { reportInput: true });
        if (!parsed.success) {
          for (const i of friendlyIssues(parsed.error.issues, entry, origin.path)) {
            error({ ...origin, path: i.path }, i.message);
          }
          return;
        }
        const value = parsed.data;
        if (value.type === 'strings') {
          strings[value.locale] = { ...strings[value.locale], ...value.entries };
        } else if (value.type === 'patch') {
          patches.push({ patch: value, origin });
        } else {
          const existing = store.get(value.id);
          if (existing) {
            error(
              { ...origin, path: [...origin.path, 'id'] },
              `duplicate id "${value.id}" (already defined in ${existing.origin.package}/${existing.origin.file}). To change existing content, use a patch`,
            );
            return;
          }
          store.set(value.id, { type: value.type, value, origin, patchedBy: [] });
        }
      });
    }

    for (const { patch, origin } of patches) {
      const target = store.get(patch.target);
      if (!target) {
        error(
          { ...origin, path: [...origin.path, 'target'] },
          `patch target "${patch.target}" not found${suggest(patch.target, [...store.keys()])}. Patches can only change content loaded before them (see "loadAfter" in mod.json)`,
        );
        continue;
      }
      const result = applyPatch(target.value as unknown as Record<string, unknown>, patch.ops);
      if (result.kind === 'failed') {
        error({ ...origin, path: [...origin.path, 'ops', result.opIndex] }, result.message);
      } else if (result.kind === 'deleted') {
        store.delete(patch.target);
      } else {
        const reparsed = ENTITY_SCHEMAS[target.type].safeParse(result.value, { reportInput: true });
        if (!reparsed.success) {
          for (const i of friendlyIssues(reparsed.error.issues, result.value)) {
            error(
              { ...origin, path: [...origin.path, 'ops'] },
              `after patching, "${patch.target}" is invalid: ${formatPath(i.path)} ${i.message}`,
            );
          }
          continue;
        }
        target.value = reparsed.data as AnyEntity;
        target.patchedBy.push(`${origin.package}/${origin.file}`);
      }
    }
  }

  // 4. References and text.
  const english = strings.en ?? {};
  for (const entity of store.values()) {
    for (const ref of collectRefs(entity.value)) {
      const at = { ...entity.origin, path: [...entity.origin.path, ...ref.path] };
      const patched =
        entity.patchedBy.length > 0 ? ` (after patches from ${entity.patchedBy.join(', ')})` : '';
      if (ref.kind === 'string') {
        if (!(ref.id in english)) {
          error(
            at,
            `missing text for "@${ref.id}" (add it to a strings file with locale "en")${patched}`,
          );
        }
        continue;
      }
      const found = store.get(ref.id);
      if (!found) {
        const candidates = [...store.values()]
          .filter((s) => s.type === ref.kind)
          .map((s) => s.value.id);
        error(at, `unknown ${ref.kind} "${ref.id}"${suggest(ref.id, candidates)}${patched}`);
      } else if (found.type !== ref.kind) {
        error(at, `"${ref.id}" is a ${found.type}, not a ${ref.kind}${patched}`);
      }
    }
  }

  // 5. Tech and civic trees must not loop (A needs B needs A), or nobody could ever finish them.
  for (const kind of ['tech', 'civic'] as const) {
    const nodes = [...store.values()].filter((s) => s.type === kind);
    const requiresOf = (id: string) => {
      const v = store.get(id)?.value;
      return v && (v.type === 'tech' || v.type === 'civic') ? v.requires : [];
    };
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (id: string, trail: string[]): string[] | undefined => {
      if (state.get(id) === 'done') return undefined;
      if (state.get(id) === 'visiting') return [...trail.slice(trail.indexOf(id)), id];
      state.set(id, 'visiting');
      for (const r of requiresOf(id)) {
        const loop = visit(r, [...trail, id]);
        if (loop) return loop;
      }
      state.set(id, 'done');
      return undefined;
    };
    for (const node of nodes.sort((a, b) => (a.value.id < b.value.id ? -1 : 1))) {
      const loop = visit(node.value.id, []);
      if (loop) {
        const at = store.get(loop[0]!)!.origin;
        error(
          { ...at, path: [...at.path, 'requires'] },
          `the ${kind} tree loops: ${loop.join(' → ')}`,
        );
        break;
      }
    }
  }

  const rules = store.get('rules');
  if (!rules)
    error(
      { package: ordered[0]?.manifest.id ?? BASE_ID },
      'no "rules" found (the base package defines them)',
    );

  if (diagnostics.some((d) => d.severity === 'error') || !rules) return { diagnostics };

  // 6. Compiled output.
  const entities = Object.fromEntries(
    ENTITY_TYPES.map((t) => [t, {}]),
  ) as CompiledContent['entities'];
  for (const s of store.values())
    (entities[s.type] as Record<string, AnyEntity>)[s.value.id] = s.value;
  const ids = Object.fromEntries(
    ENTITY_TYPES.map((t) => [t, Object.keys(entities[t]).sort()]),
  ) as CompiledContent['ids'];

  const packageInfo = ordered.map(({ manifest, raw: pkg }) => ({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    hash: contentHash(
      [...pkg.files]
        .sort((a, b) => (a.path < b.path ? -1 : 1))
        .map((f) => [f.path, f.data ?? null]),
    ),
  }));
  const body = { packages: packageInfo, entities, strings };
  return {
    diagnostics,
    content: {
      formatVersion: CONTENT_FORMAT_VERSION,
      ...body,
      hash: contentHash(body),
      ids,
      rules: rules.value as EntityByType['rules'],
    },
  };
}

function entryType(entry: unknown): string | undefined {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
  const type = (entry as { type?: unknown }).type;
  return typeof type === 'string' ? type : undefined;
}

/**
 * Orders packages so dependencies load first. `base` loads first whenever nothing forces
 * otherwise; remaining ties are broken alphabetically so the order is always the same.
 */
function loadOrder(
  packages: { manifest: Manifest; raw: RawPackage }[],
  error: (origin: { package: string; file?: string }, message: string) => void,
) {
  const byId = new Map(packages.map((p) => [p.manifest.id, p]));
  const deps = new Map<string, Set<string>>();
  for (const { manifest } of packages) {
    const set = new Set<string>();
    for (const dep of manifest.dependsOn) {
      if (byId.has(dep)) set.add(dep);
      else
        error(
          { package: manifest.id, file: 'mod.json' },
          `depends on "${dep}", which isn't loaded`,
        );
    }
    for (const after of manifest.loadAfter) if (byId.has(after)) set.add(after);
    if (manifest.id !== BASE_ID && byId.has(BASE_ID)) set.add(BASE_ID);
    deps.set(manifest.id, set);
  }

  const ordered: typeof packages = [];
  const done = new Set<string>();
  while (done.size < packages.length) {
    const ready = packages
      .map((p) => p.manifest.id)
      .filter((id) => !done.has(id) && [...deps.get(id)!].every((d) => done.has(d)))
      .sort();
    if (ready.length === 0) {
      const stuck = packages
        .map((p) => p.manifest.id)
        .filter((id) => !done.has(id))
        .sort();
      error({ package: stuck[0]! }, `load order cycle between: ${stuck.join(', ')}`);
      break;
    }
    const next = ready[0]!;
    done.add(next);
    ordered.push(byId.get(next)!);
  }
  return ordered;
}

/** ` (did you mean "grassland"?)` when a close match exists. */
function suggest(id: string, candidates: string[]): string {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = levenshtein(id, c);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best !== undefined && bestDistance <= Math.max(2, Math.floor(id.length / 3))
    ? ` (did you mean "${best}"?)`
    : '';
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length]!;
}
