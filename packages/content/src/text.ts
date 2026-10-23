import type { CompiledContent } from './compile';

/**
 * Display text for a content field: literal text as-is, `@key` looked up in the locale,
 * falling back to English, then to the key itself (validation guarantees English exists).
 */
export function resolveText(
  content: Pick<CompiledContent, 'strings'>,
  value: string,
  locale = 'en',
): string {
  if (!value.startsWith('@')) return value;
  const key = value.slice(1);
  return content.strings[locale]?.[key] ?? content.strings.en?.[key] ?? key;
}
