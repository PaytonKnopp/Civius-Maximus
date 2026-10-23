import { formatDiagnostic, resolveText } from '@cx/content';
import { compileFromDirs } from '@cx/content/node';

/** `cx validate [mod folders...]`: compiles base + mods and reports every problem. */
export function runValidate(modDirs: readonly string[]): { ok: boolean; lines: string[] } {
  const result = compileFromDirs(modDirs);
  const lines = result.diagnostics.map(formatDiagnostic);
  const errors = result.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = result.diagnostics.length - errors;

  if (!result.content) {
    lines.push(
      '',
      `✗ ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`,
    );
    return { ok: false, lines };
  }
  const c = result.content;
  for (const p of c.packages) lines.push(`✓ ${p.id} ${p.version}  ${resolveText(c, p.name)}`);
  const counts = Object.entries(c.ids)
    .filter(([, ids]) => ids.length > 0)
    .map(([type, ids]) => `${ids.length} ${type}`)
    .join(', ');
  lines.push(`  ${counts}`, `  content hash ${c.hash}`);
  if (warnings > 0) lines.push(`  ${warnings} warning${warnings === 1 ? '' : 's'}`);
  return { ok: true, lines };
}
