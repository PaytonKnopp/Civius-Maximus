import { resolveText, type SlotKind } from '@cx/content';
import {
  type Action,
  availableGovernments,
  availablePolicies,
  type EngineContext,
  type GameState,
  governmentChangeCost,
  type PlayerId,
  policyChangeCost,
  policyProblem,
  policySlots,
  SLOT_KINDS,
  withArticle,
} from '@cx/engine';
import { type DragEvent, useEffect, useState } from 'react';
import { whole } from './model';
import { Icon, Rich } from '../ui/Icon';
import { useEscape } from '../ui/Menu';

const SLOT_NAMES: Record<SlotKind, string> = {
  military: 'Military',
  economic: 'Economic',
  diplomatic: 'Diplomatic',
  wildcard: 'Wildcard',
};

const SLOT_ICONS: Record<SlotKind, string> = {
  military: 'strength',
  economic: 'gold',
  diplomatic: 'envoy',
  wildcard: 'greatPeople',
};

const DRAG = 'application/x-cx-policy';

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  act: (action: Action) => boolean;
  onClose: () => void;
}

/**
 * Government and policies (docs/06-ui-ux.md, "Government"): the government you have and its
 * slots, policy cards to drag (or click) into them, the other governments beside them. Nothing
 * changes until Confirm.
 */
export function GovernmentScreen({ ctx, state, viewer, act, onClose }: Props) {
  const { content } = ctx;
  const p = state.players[viewer]!;
  const t = (text: string) => resolveText(content, text);
  const [draft, setDraft] = useState<Record<SlotKind, string[]>>(() => structuredClone(p.policies));
  const [filter, setFilter] = useState<SlotKind | 'all'>('all');
  const [tab, setTab] = useState<'policies' | 'governments'>('policies');
  const [dragging, setDragging] = useState<string | null>(null);
  // Start over from the real cards if they change underneath (e.g. a new government trims them).
  useEffect(() => setDraft(structuredClone(p.policies)), [p.policies]);
  useEscape(onClose);

  const slots = policySlots(ctx, state, viewer);
  const slotted = new Set(SLOT_KINDS.flatMap((k) => draft[k]));
  const cost = policyChangeCost(ctx, state, viewer, draft);
  const problem = policyProblem(ctx, state, viewer, draft);
  const changes = SLOT_KINDS.reduce(
    (n, k) =>
      n +
      draft[k].filter((id) => !p.policies[k].includes(id)).length +
      p.policies[k].filter((id) => !draft[k].includes(id)).length,
    0,
  );
  const changed = SLOT_KINDS.some((k) => draft[k].join() !== p.policies[k].join());
  const govCost = governmentChangeCost(ctx, state, viewer);
  const govs = availableGovernments(ctx, p);
  const policy = (id: string) => content.entities.policy[id]!;
  const goldIcon = content.entities.yield.gold?.icon ?? '';
  const government = content.entities.government[p.government];
  const pool = availablePolicies(ctx, p).filter((id) => !slotted.has(id));
  const shown = pool.filter((id) => filter === 'all' || policy(id).slot === filter);
  const fits = (id: string, kind: SlotKind) => kind === 'wildcard' || policy(id).slot === kind;

  /** Where a card goes on a click: its own kind's free slot, else a free wildcard. */
  const add = (id: string) => {
    const kind = policy(id).slot;
    const target =
      kind !== 'wildcard' && draft[kind].length < slots[kind]
        ? kind
        : draft.wildcard.length < slots.wildcard
          ? 'wildcard'
          : undefined;
    if (!target) return;
    setDraft({ ...draft, [target]: [...draft[target], id] });
  };
  const remove = (kind: SlotKind, id: string) =>
    setDraft({ ...draft, [kind]: draft[kind].filter((x) => x !== id) });
  /** A card dropped on a slot: it takes that slot (moving out of any other one). */
  const place = (id: string, kind: SlotKind, index: number) => {
    if (!fits(id, kind)) return;
    const next = Object.fromEntries(
      SLOT_KINDS.map((k) => [k, draft[k].filter((x) => x !== id)]),
    ) as Record<SlotKind, string[]>;
    const row = [...next[kind]];
    if (index < row.length) row[index] = id;
    else row.push(id);
    next[kind] = row.slice(0, slots[kind]);
    setDraft(next);
  };
  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG, id);
      e.dataTransfer.effectAllowed = 'move';
      setDragging(id);
    },
    onDragEnd: () => setDragging(null),
  });
  const dropProps = (accept: (id: string) => boolean, onDrop: (id: string) => void) => ({
    onDragOver: (e: DragEvent) => {
      if (dragging && accept(dragging)) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      const id = e.dataTransfer.getData(DRAG);
      if (id && accept(id)) {
        e.preventDefault();
        onDrop(id);
      }
      setDragging(null);
    },
  });

  const card = (id: string, onClick: () => void, extra = '', hint = '') => {
    const pol = policy(id);
    return (
      <button
        key={id}
        type="button"
        className={`policy-card ${pol.slot} ${extra}`}
        onClick={onClick}
        title={`${t(pol.name)}\n${t(pol.description)}${hint ? `\n${hint}` : ''}`}
        {...dragProps(id)}
      >
        <span className="card-kind">
          <i className={`dot ${pol.slot}`} aria-hidden="true" />
          {SLOT_NAMES[pol.slot]}
        </span>
        <span className="card-name">{t(pol.name)}</span>
        <span className="card-text">{t(pol.description)}</span>
      </button>
    );
  };

  const governmentList = (
    <section className="gv-govs" aria-label="Governments">
      <h3>Governments</h3>
      {content.ids.government
        .map((id) => content.entities.government[id]!)
        .sort((a, b) => a.order - b.order)
        .map((g) => {
          const current = p.government === g.id;
          const open = govs.includes(g.id);
          const civic = g.requiresCivic ? content.entities.civic[g.requiresCivic] : undefined;
          const s = g.slots;
          return (
            <div key={g.id} className={`gov ${current ? 'current' : ''} ${open ? '' : 'locked'}`}>
              <div className="gov-head">
                <strong>{t(g.name)}</strong>
                <span className="slot-dots" aria-label="Slots">
                  {SLOT_KINDS.flatMap((k) =>
                    Array.from({ length: s[k] }, (_, i) => (
                      <span key={`${k}${i}`} className={`dot ${k}`} title={SLOT_NAMES[k]} />
                    )),
                  )}
                </span>
              </div>
              {g.description && <p className="hint">{t(g.description)}</p>}
              {current ? (
                <span className="badge">Current</span>
              ) : open ? (
                <button
                  type="button"
                  className="wide"
                  disabled={p.gold < govCost}
                  title={
                    p.gold < govCost
                      ? `Needs ${whole(govCost)} gold (you have ${whole(p.gold)})`
                      : `Adopt ${t(g.name)}: its slots replace yours and cards that no longer fit go back`
                  }
                  onClick={() => act({ type: 'set_government', player: viewer, government: g.id })}
                >
                  <Rich
                    text={`Adopt${govCost > 0 ? ` · ${goldIcon} ${whole(govCost)}` : ' · free'}`}
                  />
                </button>
              ) : (
                <span className="muted small-text">
                  <Icon name="lock" size={14} /> Needs {civic ? t(civic.name) : 'a civic'}
                </span>
              )}
            </div>
          );
        })}
    </section>
  );

  return (
    <div className="screen gv-screen" role="dialog" aria-label="Government">
      <header className="screen-head">
        <h2>
          <Icon name="government" size={30} />
          Government
        </h2>
        <p className="screen-sub">
          <Rich
            text={
              p.policyWindow
                ? 'You just finished a civic: changing cards and government is free this turn.'
                : `Changing a card costs ${goldIcon} ${content.rules.progress.policySwapCost}; a new government ${goldIcon} ${content.rules.progress.governmentChangeCost}. Both are free the turn you finish a civic.`
            }
          />
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="gv-tabs segmented" role="tablist" aria-label="Government">
        {(
          [
            ['policies', 'Policies'],
            ['governments', 'Governments'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'on' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={`gv-body tab-${tab}`}>
        <div className="gv-main">
          <section className="gv-plate" aria-label="Current government">
            <Icon name="government" size={48} />
            <div>
              <span className="gv-kicker">Your government</span>
              <h3>{government ? t(government.name) : p.government}</h3>
              {government?.description && <p>{t(government.description)}</p>}
            </div>
            <div className="gv-plate-side">
              <ul className="gv-slot-sum" aria-label="Slots">
                {SLOT_KINDS.filter((k) => slots[k] > 0).map((k) => (
                  <li key={k} className={k}>
                    <i className={`dot ${k}`} aria-hidden="true" />
                    {slots[k]} {SLOT_NAMES[k].toLowerCase()}
                  </li>
                ))}
              </ul>
              <button type="button" className="small" onClick={() => setTab('governments')}>
                Change government…
              </button>
            </div>
          </section>

          <div className="gv-work">
            <div className="gv-left">
              <section className="gv-slots" aria-label="Policy slots">
                {SLOT_KINDS.filter((k) => slots[k] > 0).map((k) => (
                  <div key={k} className={`gv-row ${k}`}>
                    <h4>
                      <Icon name={SLOT_ICONS[k]} size={20} />
                      {SLOT_NAMES[k]}
                      <small>
                        {draft[k].length}/{slots[k]}
                      </small>
                    </h4>
                    <div className="gv-row-cards">
                      {Array.from({ length: slots[k] }, (_, i) => {
                        const id = draft[k][i];
                        const drop = dropProps(
                          (x) => fits(x, k),
                          (x) => place(x, k, i),
                        );
                        return id ? (
                          <div key={id} className="gv-slot filled" {...drop}>
                            {card(id, () => remove(k, id), 'slotted', 'Click to take it out')}
                          </div>
                        ) : (
                          <div
                            key={`empty${i}`}
                            className={`gv-slot empty ${dragging && fits(dragging, k) ? 'can-drop' : ''}`}
                            {...drop}
                          >
                            <span>
                              Empty {SLOT_NAMES[k].toLowerCase()} slot
                              <small>
                                {k === 'wildcard'
                                  ? 'Takes any card'
                                  : `Takes ${withArticle(SLOT_NAMES[k].toLowerCase())} card`}
                              </small>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>

              <div className={`gv-confirm ${changed ? 'changed' : ''}`}>
                <span className="gv-confirm-text">
                  {!changed
                    ? 'Drag a card into a slot, or click it. Click a slotted card to take it out.'
                    : problem
                      ? problem.message
                      : `${changes} change${changes === 1 ? '' : 's'} to confirm`}
                </span>
                <button
                  type="button"
                  className="ghost"
                  disabled={!changed}
                  onClick={() => setDraft(structuredClone(p.policies))}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!changed || !!problem || p.gold < cost}
                  title={
                    p.gold < cost
                      ? `Needs ${whole(cost)} gold (you have ${whole(p.gold)})`
                      : undefined
                  }
                  onClick={() => act({ type: 'set_policies', player: viewer, policies: draft })}
                >
                  <Rich text={`Confirm${cost > 0 ? ` · ${goldIcon} ${whole(cost)}` : ''}`} />
                </button>
              </div>
            </div>
            <section
              className="gv-pool"
              aria-label="Policy cards"
              {...dropProps(
                (x) => slotted.has(x),
                (x) => {
                  const k = SLOT_KINDS.find((s) => draft[s].includes(x));
                  if (k) remove(k, x);
                },
              )}
            >
              <div className="gv-pool-head">
                <h3>Policy cards</h3>
                <div className="segmented" role="group" aria-label="Show cards">
                  {(['all', ...SLOT_KINDS] as const).map((k) => {
                    const n =
                      k === 'all' ? pool.length : pool.filter((id) => policy(id).slot === k).length;
                    if (k !== 'all' && n === 0) return null;
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={filter === k}
                        className={filter === k ? 'on' : ''}
                        onClick={() => setFilter(k)}
                      >
                        {k !== 'all' && <i className={`dot ${k}`} aria-hidden="true" />}
                        {k === 'all' ? 'All' : SLOT_NAMES[k]} <small>{n}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="gv-cards">
                {shown.map((id) => {
                  const kind = policy(id).slot;
                  const room =
                    (kind !== 'wildcard' && draft[kind].length < slots[kind]) ||
                    draft.wildcard.length < slots.wildcard;
                  return card(
                    id,
                    () => add(id),
                    room ? '' : 'no-room',
                    room
                      ? 'Click to slot it'
                      : `No free ${kind === 'wildcard' ? 'wildcard' : `${SLOT_NAMES[kind].toLowerCase()} or wildcard`} slot: drag it onto a card to swap`,
                  );
                })}
              </div>
              {availablePolicies(ctx, p).length === 0 && (
                <p className="hint">Finish civics to unlock policy cards.</p>
              )}
              {availablePolicies(ctx, p).length > 0 && pool.length === 0 && (
                <p className="hint">Every card you have is in a slot.</p>
              )}
            </section>
          </div>
        </div>
        {governmentList}
      </div>
    </div>
  );
}
