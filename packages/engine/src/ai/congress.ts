import { ballotCost, diplomaticOn, diplomaticPoints, voteCost } from '../congress/congress';
import type { Ballot } from '../state';
import { areAllies } from '../diplomacy/rules';
import { scoreOf, teamOf } from '../victory';
import { personalityOf, type Turn } from './turn';

/**
 * World Congress votes (docs/04-advanced-systems.md, "World Congress"): name itself world leader
 * (with extra votes when it can afford them), take a boon for itself or, if it trails and is
 * aggressive, a bane for the leader, and back the general resolutions its personality likes.
 */
export function voteInCongress(t: Turn) {
  const c = t.state.congress;
  if (!c?.session || c.session.turn !== t.state.turn || c.votes[t.player]) return;
  if (c.session.emergency) {
    voteOnContainment(t, c.session.agenda[0]!, c.session.emergency.target);
    return;
  }
  const traits = personalityOf(t.ctx, t.state, t.player);
  const civs = t.state.playerOrder.filter((id) => t.state.players[id]!.alive);
  const rivals = civs
    .filter((id) => id !== t.player)
    .map((id) => ({ id, score: scoreOf(t.ctx, t.state, id).total }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  const myScore = scoreOf(t.ctx, t.state, t.player).total;
  const leader = rivals[0];
  const trailing = !!leader && leader.score > myScore;
  const ballots: Ballot[] = [];
  for (const res of c.session.agenda) {
    const def = t.ctx.content.entities.resolution[res]!;
    if (def.target === 'player') {
      const points = def.options.find((o) => o.points > 0);
      if (points) {
        ballots.push({ resolution: res, option: points.id, target: t.player, votes: 1 });
        continue;
      }
      const bane = def.options.find((o) => o.tone === 'bane');
      const boon = def.options.find((o) => o.tone === 'boon');
      if (bane && leader && trailing && Number(traits.aggression ?? 5) >= 6)
        ballots.push({ resolution: res, option: bane.id, target: leader.id, votes: 1 });
      else if (boon) ballots.push({ resolution: res, option: boon.id, target: t.player, votes: 1 });
      continue;
    }
    const liked = [...def.options].sort(
      (a, b) =>
        Number(traits[(b.favoredBy ?? '') as keyof typeof traits] ?? 5) -
          Number(traits[(a.favoredBy ?? '') as keyof typeof traits] ?? 5) || (a.id < b.id ? -1 : 1),
    )[0]!;
    ballots.push({ resolution: res, option: liked.id, target: null, votes: 1 });
  }
  // Spend spare favor on the world leader vote, more as victory nears.
  const lead = ballots.find((b) =>
    t.ctx.content.entities.resolution[b.resolution]!.options.some((o) => o.points > 0),
  );
  if (lead && diplomaticOn(t.state)) {
    const goal = t.ctx.content.rules.congress.victoryPoints;
    const keep = diplomaticPoints(t.ctx, t.state, t.player) * 2 >= goal ? 0 : 20;
    while (lead.votes < 6) {
      const extra = voteCost(t.ctx, lead.votes + 1) - voteCost(t.ctx, lead.votes);
      if (ballotCost(t.ctx, ballots) + extra + keep > (t.p.favor ?? 0)) break;
      lead.votes++;
    }
  }
  t.act({ type: 'cast_votes', player: t.player, ballots });
}

/**
 * An emergency session (D120): the civ close to winning (and its team) votes against, its allies
 * stay out of it, and everyone else votes to contain it, with what favor they can spare.
 */
function voteOnContainment(t: Turn, res: string, target: string) {
  const def = t.ctx.content.entities.resolution[res]!;
  const contain = def.options.find((o) => o.tone === 'bane') ?? def.options[0]!;
  const decline = def.options.find((o) => o !== contain) ?? contain;
  const mine = teamOf(t.state, t.player).includes(target);
  const friendly = mine || areAllies(t.state, t.player, target);
  const ballot: Ballot = {
    resolution: res,
    option: friendly ? decline.id : contain.id,
    target,
    votes: 1,
  };
  // The target and its team spend all they can; the others keep a reserve.
  const keep = mine ? 0 : 20;
  const most = mine ? 6 : 3;
  if (mine || !friendly)
    while (ballot.votes < most) {
      const extra = voteCost(t.ctx, ballot.votes + 1) - voteCost(t.ctx, ballot.votes);
      if (voteCost(t.ctx, ballot.votes) + extra + keep > (t.p.favor ?? 0)) break;
      ballot.votes++;
    }
  t.act({ type: 'cast_votes', player: t.player, ballots: [ballot] });
}
