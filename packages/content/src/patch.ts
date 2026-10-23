import { stableStringify } from './hash';
import type { PatchOp } from './schema/entities';

export type PatchResult =
  | { kind: 'patched'; value: Record<string, unknown> }
  | { kind: 'deleted' }
  | { kind: 'failed'; opIndex: number; message: string };

function segments(path: string): (string | number)[] {
  return path.split('.').map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

/** Content is plain JSON, so a JSON round-trip is a complete deep copy (and works everywhere). */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function equal(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * Applies patch operations to a copy of an entity. Paths are dotted (`combat.melee`,
 * `effects.0.params.amount`). `set` creates missing objects along the way; everything else
 * requires the path to exist, so typos in a path are reported instead of silently ignored.
 */
export function applyPatch(entity: Record<string, unknown>, ops: readonly PatchOp[]): PatchResult {
  const value = clone(entity);
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    if (op.op === 'delete') return { kind: 'deleted' };

    const segs = segments(op.path);
    if (segs[0] === 'id' || segs[0] === 'type') {
      return { kind: 'failed', opIndex: i, message: `can't change "${segs[0]}" with a patch` };
    }
    let parent: Record<string | number, unknown> = value;
    for (let s = 0; s < segs.length - 1; s++) {
      const seg = segs[s]!;
      let next = parent[seg];
      if (next === undefined && op.op === 'set') {
        next = {};
        parent[seg] = next;
      }
      if (next === null || typeof next !== 'object') {
        return {
          kind: 'failed',
          opIndex: i,
          message: `path "${op.path}" not found (no "${segs.slice(0, s + 1).join('.')}")`,
        };
      }
      parent = next as Record<string | number, unknown>;
    }
    const last = segs[segs.length - 1]!;
    const current = parent[last];

    if (op.op === 'set') {
      parent[last] = clone(op.value);
    } else if (op.op === 'append') {
      if (!Array.isArray(current)) {
        return { kind: 'failed', opIndex: i, message: `"${op.path}" is not a list, can't append` };
      }
      current.push(clone(op.value));
    } else if (op.op === 'remove') {
      if (current === undefined) {
        return { kind: 'failed', opIndex: i, message: `path "${op.path}" not found` };
      }
      if ('value' in op && op.value !== undefined) {
        if (!Array.isArray(current)) {
          return { kind: 'failed', opIndex: i, message: `"${op.path}" is not a list` };
        }
        const index = current.findIndex((v) => equal(v, op.value));
        if (index < 0) {
          return {
            kind: 'failed',
            opIndex: i,
            message: `${JSON.stringify(op.value)} is not in "${op.path}"`,
          };
        }
        current.splice(index, 1);
      } else if (Array.isArray(parent) && typeof last === 'number') {
        parent.splice(last, 1);
      } else {
        delete parent[last];
      }
    }
  }
  return { kind: 'patched', value };
}
