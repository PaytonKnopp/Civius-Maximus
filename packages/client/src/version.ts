/**
 * The version number shown on the title screen and in Options: 1.0 at release, then 0.01 more for
 * every merge into `main` (1.01, 1.02 … 1.99, 2.0 …).
 *
 * Nobody has to remember to bump it: the build counts the merges on `main` (the first-parent
 * history, one entry per merged pull request) and subtracts `RELEASE_MERGES`, the count when 1.0
 * shipped. Builds of the release itself, or of anything older, read 1.0.
 */

/** Merges on `main` up to and including the one that introduced this numbering (1.0). */
export const RELEASE_MERGES = 51;

/** "1.0" for the release, then "1.01", "1.02" … "1.10" … "2.0" … */
export function formatVersion(mergesOnMain: number): string {
  const n = Math.max(0, Math.floor(mergesOnMain) - RELEASE_MERGES);
  const major = 1 + Math.floor(n / 100);
  const hundredths = n % 100;
  return hundredths === 0 ? `${major}.0` : `${major}.${String(hundredths).padStart(2, '0')}`;
}
