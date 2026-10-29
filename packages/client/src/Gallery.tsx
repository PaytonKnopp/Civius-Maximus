import { type CompiledContent, resolveText } from '@cx/content';
import { Emblem } from './ui/Emblem';
import { LeaderCard, leaderArt } from './ui/LeaderCard';

/**
 * Every leader and civ emblem on one page (`#gallery`): for checking the art, and the start of
 * the Civilopedia's leader pages.
 */
export function Gallery({ content, onBack }: { content: CompiledContent; onBack: () => void }) {
  const leaders = Object.keys(content.entities.leader).sort();
  return (
    <div className="gallery">
      <header className="screen-head">
        <h2>Leaders</h2>
        <p className="screen-sub">Every leader, their civilization and what they say.</p>
        <button type="button" className="close" onClick={onBack} aria-label="Back">
          ✕
        </button>
      </header>
      <div className="gallery-grid">
        {leaders.map((id) => {
          const art = leaderArt(content, id);
          return (
            <article key={id} className="gallery-item">
              <LeaderCard content={content} leader={id} size={180} />
              <p className="muted">{art.civName}</p>
              {art.quotes && (
                <q className="leader-quote">{resolveText(content, art.quotes.greeting)}</q>
              )}
            </article>
          );
        })}
      </div>
      <div className="gallery-emblems">
        {Object.values(content.entities.civ).map((c) => (
          <Emblem
            key={c.id}
            symbol={c.emblem}
            primary={c.colors.primary}
            secondary={c.colors.secondary}
            size={48}
            title={resolveText(content, c.name)}
          />
        ))}
      </div>
    </div>
  );
}
