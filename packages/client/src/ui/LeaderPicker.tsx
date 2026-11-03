import { type CompiledContent, resolveText } from '@cx/content';
import { type EngineContext, uniquesOf } from '@cx/engine';
import { useMemo, useState } from 'react';
import { Emblem } from './Emblem';
import { Icon } from './Icon';
import { LeaderCard, LeaderHead, leaderArt } from './LeaderCard';
import { MenuScreen } from './Menu';

/**
 * Choosing who to play, like Civ's: every leader with their civilization, what makes it special,
 * its unique units and buildings and how it plays, a search and a few filters, and a big Choose
 * button. Used by the game setup (any seat) and the online lobby.
 */

const TRAITS: [key: string, label: string][] = [
  ['aggression', 'War'],
  ['expansion', 'Expansion'],
  ['science', 'Science'],
  ['culture', 'Culture'],
  ['wonders', 'Wonders'],
  ['faith', 'Faith'],
  ['gold', 'Gold'],
  ['naval', 'Seas'],
  ['diplomacy', 'Diplomacy'],
  ['districts', 'Districts'],
];

/** A leader's strongest leanings, best first. */
export function leanings(content: CompiledContent, leader: string, count = 3) {
  const p = (content.entities.leader[leader]?.personality ?? {}) as Record<string, number>;
  return TRAITS.map(([k, label]) => ({ key: k, label, value: p[k] ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .filter((x) => x.value >= 6);
}

/** Everything about one leader and their civilization. */
export function LeaderDetail({
  content,
  leader,
  compact = false,
}: {
  content: CompiledContent;
  leader: string;
  /** Without the portrait (it's shown elsewhere). */
  compact?: boolean;
}) {
  const ctx: EngineContext = useMemo(() => ({ content }), [content]);
  const t = (text: string) => resolveText(content, text);
  const l = content.entities.leader[leader];
  const civ = l ? content.entities.civ[l.civ] : undefined;
  if (!l || !civ) return null;
  const art = leaderArt(content, leader);
  const e = content.entities;
  const uniques = uniquesOf(ctx, l.civ);
  const describe = (u: (typeof uniques)[number]) => {
    const nameOf = (kind: typeof u.kind, id: string) =>
      t((e[kind] as Record<string, { name: string }>)[id]?.name ?? id);
    if (u.kind === 'unit') {
      const d = e.unit[u.id]!;
      const bits = [
        d.strength ? `${d.strength} strength` : '',
        d.rangedStrength ? `${d.rangedStrength} ranged` : '',
        `${d.movement} move`,
      ].filter(Boolean);
      return {
        icon: d.icon,
        text: `${u.replaces ? `Replaces ${nameOf('unit', u.replaces)}. ` : ''}${bits.join(', ')}.`,
      };
    }
    if (u.kind === 'building') {
      const d = e.building[u.id]!;
      return { icon: 'building', text: d.description ? t(d.description) : 'A unique building.' };
    }
    if (u.kind === 'district') {
      const d = e.district[u.id]!;
      return {
        icon: 'district_campus',
        text: d.description ? t(d.description) : 'A unique district.',
      };
    }
    const d = e.improvement[u.id]!;
    return { icon: d.icon ?? 'improvement_farm', text: 'A unique improvement.' };
  };
  const lean = leanings(content, leader, 4);
  const personality = (l.personality ?? {}) as Record<string, number>;
  return (
    <div className="mx-leader">
      {!compact && (
        <div className="mx-leader-hero">
          <LeaderCard content={content} leader={leader} size={190} />
          <div className="mx-leader-id">
            <div className="mx-leader-civ">
              <Emblem
                symbol={art.emblem}
                primary={art.primary}
                secondary={art.secondary}
                size={46}
                title={art.civName}
              />
              <div>
                <strong>{art.civName}</strong>
                <span>{art.title}</span>
              </div>
            </div>
            {art.intro && <p className="mx-leader-intro">{art.intro}</p>}
            {l.quotes?.greeting && <q className="mx-leader-quote">{t(l.quotes.greeting)}</q>}
          </div>
        </div>
      )}
      <div className="mx-traits">
        {civ.ability && (
          <article className="mx-trait">
            <header>
              <span className="mx-trait-kind">Civilization ability</span>
              <h4>{t(civ.ability.name)}</h4>
            </header>
            <p>{t(civ.ability.description)}</p>
          </article>
        )}
        <article className="mx-trait">
          <header>
            <span className="mx-trait-kind">Leader ability</span>
            <h4>{t(l.ability.name)}</h4>
          </header>
          <p>{t(l.ability.description)}</p>
        </article>
        {uniques.map((u) => {
          const d = describe(u);
          const name = t((e[u.kind] as Record<string, { name: string }>)[u.id]?.name ?? u.id);
          return (
            <article key={`${u.kind}-${u.id}`} className="mx-trait unique">
              <header>
                <span className="mx-trait-kind">Unique {u.kind}</span>
                <h4>
                  <Icon name={d.icon} size={20} />
                  {name}
                </h4>
              </header>
              <p>{d.text}</p>
            </article>
          );
        })}
        {l.agenda && (
          <article className="mx-trait agenda">
            <header>
              <span className="mx-trait-kind">Agenda · how the AI feels about you</span>
              <h4>{t(l.agenda.name)}</h4>
            </header>
            <p>{t(l.agenda.description)}</p>
          </article>
        )}
      </div>
      {lean.length > 0 && (
        <div className="mx-style">
          <span className="mx-trait-kind">Style when the AI plays them</span>
          <div className="mx-style-bars">
            {TRAITS.filter(([k]) => (personality[k] ?? 0) >= 1).map(([k, label]) => (
              <div key={k} title={`${label}: ${personality[k]} of 10`}>
                <span>{label}</span>
                <i style={{ ['--v' as string]: (personality[k] ?? 0) / 10 }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One leader as a tile. */
function Tile({
  content,
  leader,
  on,
  taken,
  focus,
  onFocus,
  onPick,
}: {
  content: CompiledContent;
  leader: string;
  on: boolean;
  /** The seat that already has this leader. */
  taken: string | undefined;
  focus: boolean;
  onFocus: () => void;
  onPick: () => void;
}) {
  const art = leaderArt(content, leader);
  return (
    <button
      type="button"
      className={`mx-tile ${on ? 'on' : ''} ${focus ? 'focus' : ''} ${taken ? 'taken' : ''}`}
      style={{ ['--civ' as string]: art.primary, ['--civ2' as string]: art.secondary }}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      onClick={onPick}
      title={taken ? `${taken} has this leader` : `${art.name}, ${art.civName}`}
    >
      <LeaderHead content={content} leader={leader} size={52} />
      <span className="mx-tile-text">
        <strong>{art.name}</strong>
        <small>{art.civName}</small>
      </span>
      <Emblem
        className="mx-tile-emblem"
        symbol={art.emblem}
        primary={art.primary}
        secondary={art.secondary}
        size={24}
      />
      {taken && <span className="mx-tile-taken">{taken}</span>}
    </button>
  );
}

type Filter = 'all' | 'war' | 'science' | 'culture' | 'faith' | 'gold' | 'naval';
const FILTERS: [Filter, string, string][] = [
  ['all', 'All', ''],
  ['war', 'Conquest', 'aggression'],
  ['science', 'Science', 'science'],
  ['culture', 'Culture', 'culture'],
  ['faith', 'Faith', 'faith'],
  ['gold', 'Gold', 'gold'],
  ['naval', 'Seas', 'naval'],
];

/** The picker: a full screen over whatever opened it. `value` null is the random leader. */
export function LeaderPicker({
  content,
  value,
  seatLabel,
  takenBy,
  onPick,
  onClose,
  allowRandom = true,
}: {
  content: CompiledContent;
  value: string | null | undefined;
  /** Whose leader this is ("Seat 2", "You"...), for the title. */
  seatLabel: string;
  /** Leaders other seats have, by leader id → their seat's name. */
  takenBy: Record<string, string>;
  onPick: (leader: string | null) => void;
  onClose: () => void;
  allowRandom?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // Opens on the current leader, or the first one, so there is always something to read.
  const [focus, setFocus] = useState<string | null>(
    () =>
      value ??
      [...content.ids.leader].sort((a, b) =>
        resolveText(content, content.entities.leader[a]!.name).localeCompare(
          resolveText(content, content.entities.leader[b]!.name),
        ),
      )[0] ??
      null,
  );
  const t = (text: string) => resolveText(content, text);
  const all = useMemo(
    () =>
      [...content.ids.leader].sort((a, b) =>
        t(content.entities.leader[a]!.name).localeCompare(t(content.entities.leader[b]!.name)),
      ),
    [content],
  );
  const list = all.filter((id) => {
    const l = content.entities.leader[id]!;
    const civ = content.entities.civ[l.civ];
    const q = query.trim().toLowerCase();
    if (
      q &&
      !`${t(l.name)} ${civ ? t(civ.name) : ''} ${l.title ? t(l.title) : ''}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    const f = FILTERS.find(([k]) => k === filter);
    if (f && f[2]) {
      const p = (l.personality ?? {}) as Record<string, number>;
      return (p[f[2]] ?? 0) >= 7;
    }
    return true;
  });
  const shown = focus && content.entities.leader[focus] ? focus : null;
  const taken = shown ? takenBy[shown] : undefined;

  return (
    <MenuScreen
      title={`Choose a leader`}
      icon="greatPeople"
      sub={seatLabel}
      onClose={onClose}
      className="mx-picker-screen"
    >
      <div className="mx-picker">
        <div className="mx-picker-list">
          <div className="mx-picker-tools">
            <input
              type="search"
              placeholder="Search leaders and civilizations"
              aria-label="Search leaders"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mx-filters" role="group" aria-label="Filter by style">
              {FILTERS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={filter === k ? 'on' : ''}
                  aria-pressed={filter === k}
                  onClick={() => setFilter(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mx-tiles">
            {allowRandom && !query && filter === 'all' && (
              <button
                type="button"
                className={`mx-tile random ${value ? '' : 'on'} ${focus === null ? 'focus' : ''}`}
                onMouseEnter={() => setFocus(null)}
                onFocus={() => setFocus(null)}
                onClick={() => onPick(null)}
              >
                <span className="mx-random-head">?</span>
                <span className="mx-tile-text">
                  <strong>Random leader</strong>
                  <small>Any leader nobody else has</small>
                </span>
              </button>
            )}
            {list.map((id) => (
              <Tile
                key={id}
                content={content}
                leader={id}
                on={value === id}
                taken={takenBy[id]}
                focus={shown === id}
                onFocus={() => setFocus(id)}
                onPick={() => (takenBy[id] ? setFocus(id) : onPick(id))}
              />
            ))}
            {list.length === 0 && <p className="mx-empty">No leader matches.</p>}
          </div>
        </div>
        <aside className="mx-picker-detail" aria-live="polite">
          {shown ? (
            <>
              <LeaderDetail content={content} leader={shown} />
              <div className="mx-picker-choose">
                <button
                  type="button"
                  className="primary big"
                  disabled={!!taken}
                  onClick={() => onPick(shown)}
                >
                  {taken ? `${taken} has this leader` : `Play as ${leaderArt(content, shown).name}`}
                </button>
              </div>
            </>
          ) : (
            <div className="mx-empty">
              <div className="mx-random-head big">?</div>
              <strong>Random leader</strong>
              <p>
                A leader nobody else picked is drawn when the game starts. A good choice if you want
                to be surprised.
              </p>
              <button type="button" className="primary big" onClick={() => onPick(null)}>
                Choose random
              </button>
            </div>
          )}
        </aside>
      </div>
    </MenuScreen>
  );
}
