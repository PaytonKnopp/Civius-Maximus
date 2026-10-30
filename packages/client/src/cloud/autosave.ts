import { readSave, type SaveFile } from '@cx/host';
import type { EngineContext } from '@cx/engine';
import { cloud } from './cloud';

/**
 * Cloud autosaves (docs/02-multiplayer.md, "Saving"): when the player is signed in, the
 * autosave at the start of every turn also goes to their account, under the same id as the
 * browser's (`autosave`, or `autosave-online` for the online game they host). Uploads queue up
 * behind each other and only the newest waits, so a slow connection never piles them up, and a
 * failed one just waits for next turn's. Continue then picks whichever is newer, the browser's
 * or the cloud's, so a game goes on from any device: the website, the desktop app, a phone.
 */

let uploading = false;
let next: { id: string; save: SaveFile } | null = null;

export function cloudAutosave(id: string, save: SaveFile) {
  const c = cloud();
  if (!c?.signedIn) return;
  next = { id, save };
  if (uploading) return;
  uploading = true;
  void (async () => {
    while (next) {
      const job = next;
      next = null;
      try {
        await c.putSave(job.id, job.save.name, job.save.turn, job.save);
      } catch {
        // Offline, or the session expired: the next turn's autosave tries again.
      }
    }
    uploading = false;
  })();
}

/**
 * The newer of the browser's autosave and the cloud's (same id), or the browser's when the
 * cloud isn't set up, is unreachable or has nothing newer.
 */
export async function newestAutosave(
  id: string,
  local: SaveFile | null,
  ctx: EngineContext,
): Promise<SaveFile | null> {
  const c = cloud();
  if (!c?.signedIn) return local;
  try {
    const row = (await c.listSaves()).find((s) => s.id === id);
    if (!row) return local;
    if (local) {
      const gap = Date.parse(row.updatedAt) - Date.parse(local.savedAt);
      // Older, or this browser's own upload of the same autosave (no need to fetch it).
      if (gap <= 0) return local;
      if (row.turn === local.turn && row.name === local.name && gap < 10 * 60_000) return local;
    }
    const read = readSave(JSON.stringify(await c.getSave(id)), ctx);
    if (!read.ok || read.save.state.status !== 'playing') return local;
    if (local && Date.parse(read.save.savedAt) <= Date.parse(local.savedAt)) return local;
    return read.save;
  } catch {
    return local;
  }
}
