import { z } from 'zod';
import { FILE_ENTRY_SCHEMAS } from './schema/entities';
import { Manifest } from './schema/manifest';

/**
 * JSON Schemas for editors (VS Code autocompletes and underlines mistakes while typing).
 * `cx schema` writes them to `schemas/`.
 */
export function contentFileJsonSchema(): object {
  const entry = z.union(Object.values(FILE_ENTRY_SCHEMAS));
  return z.toJSONSchema(z.union([entry, z.array(entry)]), { io: 'input', unrepresentable: 'any' });
}

export function manifestJsonSchema(): object {
  return z.toJSONSchema(Manifest, { io: 'input' });
}
