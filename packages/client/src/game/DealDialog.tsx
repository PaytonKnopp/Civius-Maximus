import {
  type Action,
  areFriends,
  atWar,
  type DealTerms,
  dealProblem,
  dealVerdict,
  type EngineContext,
  type GameState,
  type PlayerId,
  type Proposal,
} from '@cx/engine';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { civName } from './model';
import { Icon } from '../ui/Icon';
import { LeaderHead } from '../ui/LeaderCard';
import { useEscape } from '../ui/Menu';

type Deal = Omit<Proposal, 'id' | 'turn'>;

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  other: PlayerId;
  act: (action: Action) => boolean;
  onClose: () => void;
}

const NONE: DealTerms = { gold: 0, goldPerTurn: 0, maps: false };

/** Build a deal with another player: gold, payments, maps, friendship, alliance, peace. */
export function DealDialog({ ctx, state, viewer, other, act, onClose }: Props) {
  const rules = ctx.content.rules.diplomacy;
  const war = atWar(state, viewer, other);
  const friends = areFriends(state, viewer, other);
  const [give, setGive] = useState<DealTerms>(NONE);
  const [get, setGet] = useState<DealTerms>(NONE);
  const [turns, setTurns] = useState(Math.min(20, rules.maxDealTurns));
  const [friendship, setFriendship] = useState(false);
  const [alliance, setAlliance] = useState(false);
  const [peace, setPeace] = useState(war);
  useEscape(onClose);

  const deal: Deal = { from: viewer, to: other, give, get, turns, friendship, alliance, peace };
  const problem = dealProblem(ctx, state, deal);
  const ai = state.players[other]!.kind === 'ai';
  const verdict = ai && !problem ? dealVerdict(ctx, state, other, deal) : undefined;
  const name = civName(ctx.content, state, other);
  const send = () => {
    if (act({ type: 'propose_deal', player: viewer, ...deal })) onClose();
  };

  const face = (p: PlayerId, size: number) => (
    <LeaderHead
      content={ctx.content}
      leader={state.players[p]!.leader}
      civ={state.players[p]!.civ}
      size={size}
    />
  );
  const side = (
    who: PlayerId,
    label: string,
    terms: DealTerms,
    set: (t: DealTerms) => void,
    max: number,
  ) => (
    <fieldset className="deal-side">
      <legend>
        {face(who, 26)} {label}
      </legend>
      <p className="deal-has">
        <Icon name="gold" size={16} /> {max} gold in the treasury
      </p>
      <label>
        <span>
          <Icon name="gold" size={16} /> Gold now
        </span>
        <input
          type="number"
          min={0}
          max={max}
          step={10}
          value={terms.gold}
          disabled={war && !peace}
          onChange={(e) => set({ ...terms, gold: Math.max(0, Math.floor(+e.target.value || 0)) })}
        />
      </label>
      <label>
        <span>
          <Icon name="gold" size={16} /> Gold per turn
        </span>
        <input
          type="number"
          min={0}
          step={1}
          value={terms.goldPerTurn}
          disabled={war && !peace}
          onChange={(e) =>
            set({ ...terms, goldPerTurn: Math.max(0, Math.floor(+e.target.value || 0)) })
          }
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={terms.maps}
          disabled={war && !peace}
          onChange={(e) => set({ ...terms, maps: e.target.checked })}
        />
        <Icon name="lens" size={16} /> Share maps
      </label>
    </fieldset>
  );

  // A portal: the dialog covers the screen, not the panel that opened it.
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal deal" role="dialog" aria-label={`Deal with ${name}`}>
        <header className="deal-head">
          {face(viewer, 44)}
          <h3>Deal with {name}</h3>
          {face(other, 44)}
        </header>
        <div className="deal-sides">
          {side(viewer, 'You give', give, setGive, Math.floor(state.players[viewer]!.gold / 100))}
          {side(other, `${name} gives`, get, setGet, Math.floor(state.players[other]!.gold / 100))}
        </div>
        <div className="deal-shared">
          {war ? (
            <label className="check">
              <input type="checkbox" checked={peace} onChange={(e) => setPeace(e.target.checked)} />
              <Icon name="peace" size={18} /> Make peace ({rules.peaceTreatyTurns} turns of treaty)
            </label>
          ) : (
            <>
              <label
                className="check"
                title={`Lasts ${rules.friendshipTurns} turns; no war between you while it lasts`}
              >
                <input
                  type="checkbox"
                  checked={friendship}
                  onChange={(e) => setFriendship(e.target.checked)}
                />
                <Icon name="friends" size={18} />{' '}
                {friends ? 'Renew our friendship' : 'Declare friendship'} ({rules.friendshipCost}{' '}
                influence each)
              </label>
              <label
                className="check"
                title={`Lasts ${rules.allianceTurns} turns; allies share vision`}
              >
                <input
                  type="checkbox"
                  checked={alliance}
                  onChange={(e) => setAlliance(e.target.checked)}
                />
                <Icon name="alliance" size={18} /> Form an alliance ({rules.allianceCost} influence
                each)
              </label>
            </>
          )}
          {(give.goldPerTurn > 0 || get.goldPerTurn > 0) && (
            <label>
              Payments for
              <input
                type="number"
                min={1}
                max={rules.maxDealTurns}
                value={turns}
                onChange={(e) =>
                  setTurns(
                    Math.min(rules.maxDealTurns, Math.max(1, Math.floor(+e.target.value || 1))),
                  )
                }
              />
              turns
            </label>
          )}
        </div>
        <p className={`deal-verdict ${verdict ? (verdict.accept ? 'yes' : 'no') : ''}`}>
          {verdict && <Icon name={verdict.accept ? 'check' : 'war'} size={18} />}
          {problem
            ? problem.message
            : verdict
              ? verdict.accept
                ? `${name} would accept.`
                : `${name} would decline: ${verdict.reasons.join(', ').toLowerCase() || 'not enough in it for them'}.`
              : `${name} will see it on their turn.`}
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!!problem} onClick={send}>
            Propose
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One line describing a deal, from `viewer`'s side ("You give 50 gold · They give friendship"). */
export function describeDeal(ctx: EngineContext, state: GameState, p: Proposal, viewer: PlayerId) {
  const terms = (t: DealTerms) =>
    [
      t.gold > 0 ? `${t.gold} gold` : '',
      t.goldPerTurn > 0 ? `${t.goldPerTurn} gold a turn for ${p.turns} turns` : '',
      t.maps ? 'their maps' : '',
    ].filter(Boolean);
  const mine = p.from === viewer ? p.give : p.get;
  const theirs = p.from === viewer ? p.get : p.give;
  const shared = [
    p.peace && 'peace',
    p.friendship && 'friendship',
    p.alliance && 'an alliance',
  ].filter(Boolean);
  const them = civName(ctx.content, state, p.from === viewer ? p.to : p.from);
  return [
    shared.length ? `Both: ${shared.join(', ')}` : '',
    terms(mine).length
      ? `You give ${terms(mine).join(', ').replace('their maps', 'your maps')}`
      : '',
    terms(theirs).length ? `${them} gives ${terms(theirs).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
