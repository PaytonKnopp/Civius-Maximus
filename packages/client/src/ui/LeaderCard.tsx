import { type CompiledContent, resolveText } from '@cx/content';
import { Emblem } from './Emblem';
import { Portrait } from './Portrait';

/** Everything needed to draw a leader: portrait, colors, emblem, names. */
export function leaderArt(content: CompiledContent, leaderId: string, civId?: string) {
  const leader = content.entities.leader[leaderId];
  const civ = content.entities.civ[civId ?? leader?.civ ?? ''];
  return {
    portrait: leader?.portrait,
    primary: civ?.colors.primary ?? '#5a4a3a',
    secondary: civ?.colors.secondary ?? '#e8d9a8',
    emblem: civ?.emblem ?? 'star',
    /** The civ's architecture, for the scene behind the portrait. */
    scene: civ?.architecture ?? 'mediterranean',
    name: leader ? resolveText(content, leader.name) : leaderId,
    title: leader?.title ? resolveText(content, leader.title) : '',
    civName: civ ? resolveText(content, civ.name) : '',
    quotes: leader?.quotes,
    intro: leader?.intro ? resolveText(content, leader.intro) : '',
  };
}

/** A small round head portrait, for chips and lists. */
export function LeaderHead({
  content,
  leader,
  civ,
  size = 32,
  title,
}: {
  content: CompiledContent;
  leader: string;
  civ?: string;
  size?: number;
  title?: string;
}) {
  const art = leaderArt(content, leader, civ);
  return (
    <span className="leader-head" style={{ width: size, height: size }}>
      <Portrait
        portrait={art.portrait}
        primary={art.primary}
        secondary={art.secondary}
        size={size}
        crop="head"
        {...(title ? { title } : {})}
      />
    </span>
  );
}

/** A framed portrait with the civ's emblem, the leader's name and title. */
export function LeaderCard({
  content,
  leader,
  civ,
  size = 200,
  painted = true,
  quote,
}: {
  content: CompiledContent;
  leader: string;
  civ?: string;
  size?: number;
  painted?: boolean;
  /** A line under the name, in quotes. */
  quote?: string;
}) {
  const art = leaderArt(content, leader, civ);
  return (
    <figure className="leader-card">
      <div className="leader-frame">
        <Portrait
          portrait={art.portrait}
          primary={art.primary}
          secondary={art.secondary}
          scene={art.scene}
          size={size}
          painted={painted}
          title={art.name}
        />
        <Emblem
          className="leader-emblem"
          symbol={art.emblem}
          primary={art.primary}
          secondary={art.secondary}
          size={Math.round(size * 0.24)}
          title={art.civName}
        />
      </div>
      <figcaption>
        <strong>{art.name}</strong>
        {art.title && <span className="leader-title">{art.title}</span>}
        {quote && <q className="leader-quote">{quote}</q>}
      </figcaption>
    </figure>
  );
}
