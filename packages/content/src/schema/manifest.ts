import { z } from 'zod';

const PackageId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'must be kebab-case: lowercase letters, digits and dashes');

/** `mod.json` at the root of every content package (the base game included). */
export const Manifest = z.strictObject({
  id: PackageId,
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'must be a version like 1.0.0'),
  authors: z.array(z.string().min(1)).default([]),
  description: z.string().default(''),
  /** Packages that must be present. Loaded before this one. */
  dependsOn: z.array(PackageId).default([]),
  /** Packages that, if present, load before this one. */
  loadAfter: z.array(PackageId).default([]),
  tags: z.array(z.string()).default([]),
});
export type Manifest = z.infer<typeof Manifest>;
