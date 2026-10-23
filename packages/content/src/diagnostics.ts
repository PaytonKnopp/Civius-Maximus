import type { z } from 'zod';

export type PathSegment = string | number;

export interface Diagnostic {
  severity: 'error' | 'warning';
  /** Package ID (or its folder name if the manifest itself is broken). */
  package: string;
  /** File path inside the package, e.g. `units/longship.json`. */
  file?: string;
  /** Location inside the file, e.g. `[0].combat.melee`. */
  path?: string;
  message: string;
}

export function formatPath(path: readonly PathSegment[]): string {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out === '' ? seg : `.${seg}`;
  }
  return out;
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = [d.file ? `${d.package}/${d.file}` : d.package, d.path].filter(Boolean).join('  ');
  return `${d.severity === 'error' ? 'error  ' : 'warning'}  ${where}  ${d.message}`;
}

function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  return JSON.stringify(value);
}

function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let cur = root;
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[seg];
  }
  return cur;
}

type Issue = z.core.$ZodIssue;

function depth(issues: readonly Issue[]): number {
  return Math.max(0, ...issues.map((i) => i.path.length));
}

/**
 * Turns Zod issues into short, human messages: `must be a number, got "25"` instead of
 * Zod's defaults. Union failures report the branch that got furthest, which is almost always
 * the one the author meant.
 */
export function friendlyIssues(
  issues: readonly Issue[],
  root: unknown,
  base: readonly PathSegment[] = [],
): { path: PathSegment[]; message: string }[] {
  const out: { path: PathSegment[]; message: string }[] = [];
  for (const issue of issues) {
    const path = [...base, ...(issue.path as PathSegment[])];
    const here = valueAt(root, issue.path);
    switch (issue.code) {
      case 'invalid_type':
        out.push({
          path,
          message:
            here === undefined
              ? `is required (${issue.expected})`
              : `must be ${issue.expected === 'array' ? 'a list' : `a ${issue.expected}`}, got ${describe(here)}`,
        });
        break;
      case 'unrecognized_keys':
        out.push({
          path,
          message: `unknown field${issue.keys.length > 1 ? 's' : ''} ${issue.keys.map((k) => `"${k}"`).join(', ')}`,
        });
        break;
      case 'invalid_value':
        out.push({
          path,
          message: `must be ${issue.values.length === 1 ? '' : 'one of '}${issue.values.map((v) => JSON.stringify(v)).join(', ')}, got ${describe(here)}`,
        });
        break;
      case 'invalid_union': {
        const unionIssue = issue as Issue & {
          discriminator?: string;
          options?: unknown[];
          errors: Issue[][];
        };
        if (unionIssue.discriminator) {
          // Zod points the path at the discriminator field itself.
          const allowed = (unionIssue.options ?? []).map(String).join(', ');
          out.push({
            path,
            message: `unknown ${unionIssue.discriminator} ${describe(here)}${allowed ? ` (expected one of: ${allowed})` : ''}`,
          });
          break;
        }
        const branches = unionIssue.errors.filter((b) => b.length > 0);
        // For objects, the intended branch is the one that recognizes every field the author wrote.
        const recognizing = branches.filter(
          (b) => !b.some((i) => i.code === 'unrecognized_keys' && i.path.length === 0),
        );
        const pool = recognizing.length > 0 ? recognizing : branches;
        const best = pool.reduce<Issue[] | undefined>(
          (acc, b) => (acc === undefined || depth(b) > depth(acc) ? b : acc),
          undefined,
        );
        if (recognizing.length > 0 && best) {
          out.push(...friendlyIssues(best, here, path));
        } else if (here && typeof here === 'object' && !Array.isArray(here)) {
          // No branch accepts these fields: list the fields the branches would have accepted.
          const expected = [
            ...new Set(
              branches.flatMap((b) =>
                b
                  .filter((i) => i.path.length === 1 && valueAt(here, i.path) === undefined)
                  .map((i) => String(i.path[0])),
              ),
            ),
          ];
          const keys = Object.keys(here);
          out.push({
            path,
            message: `unknown ${keys.map((k) => `"${k}"`).join(', ') || '(empty object)'}${expected.length ? ` (expected one of: ${expected.join(', ')})` : ''}`,
          });
        } else if (best && depth(best) > 0) {
          out.push(...friendlyIssues(best, here, path));
        } else {
          out.push({ path, message: `doesn't match any allowed form, got ${describe(here)}` });
        }
        break;
      }
      case 'too_small':
        out.push({
          path,
          message:
            issue.origin === 'array'
              ? `needs at least ${issue.minimum} item${Number(issue.minimum) === 1 ? '' : 's'}`
              : issue.origin === 'string'
                ? 'must not be empty'
                : `must be at least ${issue.minimum}`,
        });
        break;
      case 'too_big':
        out.push({
          path,
          message:
            issue.origin === 'array'
              ? `can have at most ${issue.maximum} items`
              : `must be at most ${issue.maximum}`,
        });
        break;
      case 'not_multiple_of':
        out.push({
          path,
          message: `must be a multiple of ${issue.divisor}, got ${describe(here)}`,
        });
        break;
      default:
        out.push({ path, message: issue.message });
    }
  }
  return out;
}
