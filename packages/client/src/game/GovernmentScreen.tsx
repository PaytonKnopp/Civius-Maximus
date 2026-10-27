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
} from '@cx/engine';
import { useEffect, useState } from 'react';
import { whole } from './model';
import { Icon } from '../ui/Icon';

const SLOT_NAMES: Record<SlotKind, string> = {
  military: 'Military',
  economic: 'Economic',
  diplomatic: 'Diplomatic',
  wildcard: 'Wildcard',
};

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  act: (action: Action) => boolean;
  onClose: () => void;
}

/** Government choice and policy cards: click a card to slot it, click a slotted card to remove it. */
export function GovernmentScreen({ ctx, state, viewer, act, onClose }: Props) {
  const { content } = ctx;
  const p = state.players[viewer]!;
  const [draft, setDraft] = useState<Record<SlotKind, string[]>>(() => structuredClone(p.policies));
  // Start over from the real cards if they change underneath (e.g. a new government trims them).
  useEffect(() => setDraft(structuredClone(p.policies)), [p.policies]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const slots = policySlots(ctx, state, viewer);
  const slotted = new Set(SLOT_KINDS.flatMap((k) => draft[k]));
  const cost = policyChangeCost(ctx, state, viewer, draft);
  const problem = policyProblem(ctx, state, viewer, draft);
  const changed = SLOT_KINDS.some((k) => draft[k].join() !== p.policies[k].join());
  const govCost = governmentChangeCost(ctx, state, viewer);
  const govs = availableGovernments(ctx, p);
  const policy = (id: string) => content.entities.policy[id]!;
  const goldIcon = content.entities.yield.gold?.icon ?? '';

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

  const card = (id: string, onClick: () => void, extra = '') => {
    const pol = policy(id);
    return (
      <button
        key={id}
        type="button"
        className={`policy-card ${pol.slot} ${extra}`}
        onClick={onClick}
        title={resolveText(content, pol.description)}
      >
        <span className="card-name">{resolveText(content, pol.name)}</span>
        <span className="card-text">{resolveText(content, pol.description)}</span>
      </button>
    );
  };

  return (
    <div className="screen" role="dialog" aria-label="Government">
      <header className="screen-head">
        <h2>
          <Icon name="government" size={30} />
          Government
        </h2>
        <p className="screen-sub">
          {p.policyWindow
            ? 'You just finished a civic: changing cards and government is free this turn.'
            : `Changing a card costs ${goldIcon} ${content.rules.progress.policySwapCost}; a new government costs ${goldIcon} ${content.rules.progress.governmentChangeCost}. Both are free the turn you finish a civic.`}
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="gov-body">
        <section className="gov-list" aria-label="Governments">
          {content.ids.government
            .map((id) => content.entities.government[id]!)
            .sort((a, b) => a.order - b.order)
            .map((g) => {
              const current = p.government === g.id;
              const open = govs.includes(g.id);
              const civic = g.requiresCivic ? content.entities.civic[g.requiresCivic] : undefined;
              const s = g.slots;
              return (
                <div
                  key={g.id}
                  className={`gov ${current ? 'current' : ''} ${open ? '' : 'locked'}`}
                >
                  <div className="gov-head">
                    <strong>{resolveText(content, g.name)}</strong>
                    <span className="slot-dots" aria-label="Slots">
                      {SLOT_KINDS.flatMap((k) =>
                        Array.from({ length: s[k] }, (_, i) => (
                          <span key={`${k}${i}`} className={`dot ${k}`} title={SLOT_NAMES[k]} />
                        )),
                      )}
                    </span>
                  </div>
                  {g.description && <p className="hint">{resolveText(content, g.description)}</p>}
                  {current ? (
                    <span className="badge">Current</span>
                  ) : open ? (
                    <button
                      type="button"
                      className="wide"
                      disabled={p.gold < govCost}
                      onClick={() =>
                        act({ type: 'set_government', player: viewer, government: g.id })
                      }
                    >
                      Adopt{govCost > 0 ? ` · ${goldIcon} ${whole(govCost)}` : ' · free'}
                    </button>
                  ) : (
                    <span className="muted small-text">
                      Needs {civic ? resolveText(content, civic.name) : 'a civic'}
                    </span>
                  )}
                </div>
              );
            })}
        </section>
        <section className="gov-slots" aria-label="Policy slots">
          {SLOT_KINDS.filter((k) => slots[k] > 0).map((k) => (
            <div key={k} className="slot-row">
              <h4 className={k}>{SLOT_NAMES[k]}</h4>
              <div className="slot-cards">
                {Array.from({ length: slots[k] }, (_, i) => {
                  const id = draft[k][i];
                  return id ? (
                    card(id, () => remove(k, id), 'slotted')
                  ) : (
                    <div key={`empty${i}`} className={`policy-card empty ${k}`}>
                      Empty {SLOT_NAMES[k].toLowerCase()} slot
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="gov-confirm">
            {problem && changed && <span className="error">{problem.message}</span>}
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
              onClick={() => act({ type: 'set_policies', player: viewer, policies: draft })}
            >
              Confirm{cost > 0 ? ` · ${goldIcon} ${whole(cost)}` : ''}
            </button>
          </div>
          <h4>Available cards</h4>
          <div className="card-pool">
            {availablePolicies(ctx, p)
              .filter((id) => !slotted.has(id))
              .map((id) => card(id, () => add(id)))}
            {availablePolicies(ctx, p).length === 0 && (
              <p className="hint">Finish civics to unlock policy cards.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
