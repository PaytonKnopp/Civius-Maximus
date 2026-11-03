import type { EngineContext, GameState } from '@cx/engine';
import { makeSave, readSave } from '@cx/host';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cloud, type CloudSave } from '../cloud/cloud';
import {
  AUTOSAVE,
  deleteSave,
  downloadSave,
  listSaves,
  loadSave,
  ONLINE_AUTOSAVE,
  type SaveSummary,
  storeSave,
} from '../game/storage';
import { LeaderHead, leaderArt } from '../ui/LeaderCard';
import { MenuScreen, Section } from '../ui/Menu';
import { ago, describeSave } from './saveInfo';

type Detail = ReturnType<typeof describeSave>;

/**
 * Save and load: the games kept in this browser (with who you play and how far along), the ones
 * in your account when signed in, and files. From the title screen it only loads; from a game it
 * saves the game too.
 */
export function SavesScreen({
  ctx,
  current,
  onClose,
  onLoad,
}: {
  ctx: EngineContext;
  /** The game in progress, when there is one to save. */
  current: () => GameState | undefined;
  onClose: () => void;
  onLoad: (state: GameState) => void;
}) {
  const canSave = current() !== undefined;
  const [saves, setSaves] = useState<SaveSummary[] | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const remote = cloud();
  const [cloudSaves, setCloudSaves] = useState<CloudSave[] | null>(null);
  const [name, setName] = useState(() => `Turn ${current()?.turn ?? 1}`);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listSaves()
      .then(setSaves)
      .catch(() => {
        setSaves([]);
        setMessage("This browser can't keep saved games here; use Export file instead.");
      });
  }, []);
  useEffect(refresh, [refresh]);
  const refreshCloud = useCallback(() => {
    if (!remote?.signedIn) return;
    remote
      .listSaves()
      .then(setCloudSaves)
      .catch((e: Error) => setMessage(e.message));
  }, [remote]);
  useEffect(refreshCloud, [refreshCloud]);

  // Who each saved game plays, read one by one so the list shows at once.
  useEffect(() => {
    if (!saves) return;
    let live = true;
    void (async () => {
      for (const s of saves) {
        if (!live || details[s.id]) continue;
        try {
          const rec = await loadSave(s.id);
          const read = rec ? readSave(JSON.stringify(rec), ctx) : undefined;
          if (live && read?.ok) setDetails((d) => ({ ...d, [s.id]: describeSave(ctx, read.save) }));
        } catch {
          // Unreadable here: the row shows what it knows.
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [saves, ctx]);

  const saveHere = async () => {
    const state = current();
    if (!state) return;
    try {
      await storeSave(`save-${Date.now()}`, makeSave(state, name.trim() || `Turn ${state.turn}`));
      setMessage('Saved in this browser.');
      refresh();
    } catch {
      setMessage('Saving failed (is the browser out of space?). Try Export file.');
    }
  };
  const saveToCloud = async () => {
    const state = current();
    if (!state || !remote) return;
    try {
      const label = name.trim() || `Turn ${state.turn}`;
      await remote.putSave(`save-${Date.now()}`, label, state.turn, makeSave(state, label));
      setMessage('Saved to your account.');
      refreshCloud();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const load = async (id: string) => {
    const s = await loadSave(id).catch(() => undefined);
    const read = s ? readSave(JSON.stringify(s), ctx) : undefined;
    if (!read) setMessage('That save is gone.');
    else if (!read.ok) setMessage(read.message);
    else onLoad(read.save.state);
  };
  const loadFromCloud = async (id: string) => {
    try {
      const read = readSave(JSON.stringify(await remote!.getSave(id)), ctx);
      if (!read.ok) setMessage(read.message);
      else onLoad(read.save.state);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const importFile = async (f: File) => {
    const read = readSave(await f.text(), ctx);
    if (!read.ok) setMessage(read.message);
    else onLoad(read.save.state);
  };

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (saves ?? []).filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [saves, filter]);
  const label = (s: SaveSummary) =>
    s.id === AUTOSAVE ? 'Autosave' : s.id === ONLINE_AUTOSAVE ? 'Online autosave' : s.name;

  return (
    <MenuScreen
      title={canSave ? 'Save and load' : 'Load game'}
      icon="check"
      sub="Saved games in this browser, in your account, and in files"
      onClose={onClose}
      className="mx-saves"
    >
      <div
        className={`mx-saves-scroll ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) void importFile(f);
        }}
      >
        {canSave && (
          <Section title="Save this game">
            <form
              className="mx-save-form"
              onSubmit={(e) => {
                e.preventDefault();
                void saveHere();
              }}
            >
              <input
                aria-label="Save name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" className="primary">
                Save here
              </button>
              {remote?.signedIn && (
                <button type="button" onClick={() => void saveToCloud()}>
                  Save to my account
                </button>
              )}
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const state = current();
                  if (state) downloadSave(makeSave(state, name.trim() || `Turn ${state.turn}`));
                }}
              >
                Export file
              </button>
            </form>
          </Section>
        )}
        {message && (
          <p className="mx-message" role="status">
            {message}
          </p>
        )}

        <Section title="In this browser" hint="An autosave is made at the start of every turn.">
          {saves !== null && saves.length > 4 && (
            <input
              type="search"
              className="mx-save-filter"
              placeholder="Find a save"
              aria-label="Find a save"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          {saves === null ? (
            <p className="hint">Loading…</p>
          ) : shown.length === 0 ? (
            <div className="mx-empty">
              <strong>No saved games yet</strong>
              <p>Your game saves itself every turn. Start one and it will be here.</p>
            </div>
          ) : (
            <ul className="mx-save-list">
              {shown.map((s) => {
                const d = details[s.id];
                return (
                  <li key={s.id} className={s.id === AUTOSAVE ? 'auto' : ''}>
                    {d ? (
                      <LeaderHead content={ctx.content} leader={d.leader} size={52} />
                    ) : (
                      <span className="mx-random-head small">…</span>
                    )}
                    <div className="mx-save-text">
                      <strong>{label(s)}</strong>
                      <span>
                        {d ? `${leaderArt(ctx.content, d.leader).civName} · ` : ''}
                        turn {s.turn}
                        {d?.era ? ` · ${d.era}` : ''}
                      </span>
                      <small>
                        {d
                          ? `${d.settlements} settlement${d.settlements === 1 ? '' : 's'} · score ${d.score} · ${d.civs} civs · `
                          : ''}
                        {ago(s.savedAt)}
                      </small>
                    </div>
                    <div className="mx-save-actions">
                      <button type="button" className="primary" onClick={() => void load(s.id)}>
                        Load
                      </button>
                      {confirm === s.id ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={() =>
                            void deleteSave(s.id)
                              .then(refresh)
                              .then(() => setConfirm(null))
                          }
                        >
                          Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ghost"
                          aria-label={`Delete ${label(s)}`}
                          onClick={() => setConfirm(s.id)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {remote?.signedIn && (
          <Section title="In your account" hint="Play on any device you sign in on.">
            {cloudSaves === null ? (
              <p className="hint">Loading…</p>
            ) : cloudSaves.length === 0 ? (
              <p className="hint">Nothing in your account yet.</p>
            ) : (
              <ul className="mx-save-list">
                {cloudSaves.map((s) => (
                  <li key={s.id}>
                    <span className="mx-random-head small">☁</span>
                    <div className="mx-save-text">
                      <strong>{s.name}</strong>
                      <span>turn {s.turn}</span>
                      <small>{ago(s.updatedAt)}</small>
                    </div>
                    <div className="mx-save-actions">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void loadFromCloud(s.id)}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        aria-label={`Delete ${s.name} from your account`}
                        onClick={() =>
                          void remote
                            .deleteSave(s.id)
                            .then(refreshCloud)
                            .catch((e: Error) => setMessage(e.message))
                        }
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="From a file" hint="Drop a save file anywhere on this screen, or pick one.">
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
            }}
          />
          <button type="button" onClick={() => file.current?.click()}>
            Import a save file…
          </button>
        </Section>
      </div>
    </MenuScreen>
  );
}
