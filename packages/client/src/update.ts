/**
 * Staying up to date (docs/guides/desktop.md, "How updates reach everyone"). The website is
 * rebuilt whenever `main` changes; each build has an id and publishes it as `version.json`.
 *
 * - `newVersionOut` asks the site for its current build, so a game left open (a tab, the
 *   desktop app) can offer a reload when there's a newer one.
 * - `openLiveSite` is the desktop app's launcher: the app carries a copy of the game for when
 *   there's no internet, but whenever the website answers it opens that instead, so the app
 *   always runs the latest version without being installed again.
 */

const env = import.meta.env as Record<string, string | undefined>;

export const BUILD_ID = env.VITE_BUILD_ID ?? 'dev';
export const BUILD_AT = env.VITE_BUILD_AT ?? '';

/** The website the desktop app opens (set only in the desktop build). */
const LIVE_URL = env.VITE_LIVE_URL ?? '';

/** The build the site serves now, or null if it can't be told (offline, a dev server). */
async function currentBuild(base: string): Promise<string | null> {
  try {
    const res = await fetch(new URL('version.json', base), { cache: 'no-store' });
    if (!res.ok) return null;
    const v = (await res.json()) as { id?: unknown };
    return typeof v.id === 'string' ? v.id : null;
  } catch {
    return null;
  }
}

/** Whether the site has a newer build than the one running here. */
export async function newVersionOut(): Promise<boolean> {
  if (BUILD_ID === 'dev' || BUILD_ID.startsWith('local-')) return false;
  const live = await currentBuild(LIVE_URL || location.href);
  return live !== null && live !== BUILD_ID;
}

/**
 * In the desktop app, opens the website if it answers within a few seconds (true: the page is
 * leaving). Otherwise the copy of the game inside the app plays, offline.
 */
export async function openLiveSite(): Promise<boolean> {
  if (!LIVE_URL) return false;
  let live: URL;
  try {
    live = new URL(LIVE_URL);
  } catch {
    return false;
  }
  if (location.origin === live.origin) return false;
  // The site says which build it serves (GitHub Pages allows reading it from anywhere); if
  // that's refused, any answer at all still means it's there.
  const reachable = async () =>
    (await currentBuild(live.href)) !== null ||
    (await fetch(new URL('version.json', live), { mode: 'no-cors', cache: 'no-store' }).then(
      () => true,
      () => false,
    ));
  const answered = await Promise.race([
    reachable(),
    new Promise<boolean>((r) => setTimeout(() => r(false), 5000)),
  ]);
  if (!answered) return false;
  // A fresh address each launch, so a cached copy of the page is never used.
  live.searchParams.set('launch', Date.now().toString(36));
  live.hash = location.hash;
  location.replace(live.href);
  return true;
}

/** "Oct 30, 2026 · 1a2b3c4" for the title screen. */
export function versionLabel(): string {
  const when = BUILD_AT
    ? new Date(BUILD_AT).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';
  const id = BUILD_ID.startsWith('local-') ? 'local build' : BUILD_ID.slice(0, 7);
  return [when, id].filter(Boolean).join(' · ');
}
