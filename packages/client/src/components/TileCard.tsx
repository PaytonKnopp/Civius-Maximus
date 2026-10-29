import { type CompiledContent, resolveText } from '@cx/content';
import {
  computeTileYields,
  explainYields,
  formatFixed,
  isOnRiver,
  type MapState,
  neighbors,
} from '@cx/engine';
import { Icon, Rich } from '../ui/Icon';

/** Tile inspector: what's on a tile and its yields, with the "why?" breakdown. */
export function TileCard({
  content,
  map,
  tile,
  pinned,
  onClose,
}: {
  content: CompiledContent;
  map: MapState;
  tile: number;
  pinned: boolean;
  onClose: () => void;
}) {
  const t = map.tiles[tile]!;
  const rivers = map.tiles.map((x) => x.river);
  const facts = (i: number) => ({
    ...map.tiles[i]!,
    river: isOnRiver(map, rivers, i),
    ownerId: null,
    // A damaged improvement gives nothing until it's repaired.
    improvement: map.tiles[i]!.pillaged !== undefined ? null : map.tiles[i]!.improvement,
  });
  const ctx = {
    content,
    tile: facts(tile),
    neighbors: neighbors(map, tile).map(facts),
    playerId: '',
  };
  const breakdown = computeTileYields(ctx);
  const lines = explainYields(ctx, breakdown);
  const terrain = content.entities.terrain[t.terrain]!;
  const name = (v: string) => resolveText(content, v);
  const title = [
    t.elevation === 'mountain'
      ? 'Mountain'
      : t.elevation === 'hills'
        ? `${name(terrain.name)} Hills`
        : name(terrain.name),
    t.feature ? name(content.entities.feature[t.feature]!.name) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const resource = t.resource ? content.entities.resource[t.resource] : undefined;
  const wonder = t.feature ? content.entities.feature[t.feature]?.naturalWonder : undefined;
  const adjacent = wonder
    ? Object.entries(wonder.adjacentYields)
        .map(([y, n]) => `+${n} ${content.entities.yield[y]?.icon ?? y}`)
        .join(' ')
    : '';

  return (
    <aside className="tile-card" aria-live="polite">
      <div className="tile-head">
        <h3>{title}</h3>
        {pinned && (
          <button type="button" className="ghost small" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      {wonder && (
        <p className="tile-wonder">
          <strong>Natural wonder.</strong> {name(wonder.description)}
          {adjacent && (
            <>
              {' '}
              Tiles next to it get <Rich text={adjacent} />
            </>
          )}
        </p>
      )}
      <dl className="facts">
        <dt>Tile</dt>
        <dd className="mono">
          {tile % map.width}, {Math.floor(tile / map.width)}
        </dd>
        {resource && (
          <>
            <dt>Resource</dt>
            <dd>
              <Icon name={t.resource!} size={18} /> {name(resource.name)}{' '}
              <span className={`chip ${resource.class}`}>{resource.class}</span>
            </dd>
          </>
        )}
        {t.pillaged !== undefined && t.improvement && (
          <>
            <dt>Damaged</dt>
            <dd>
              {name(content.entities.improvement[t.improvement]?.name ?? t.improvement)} out of use
              until turn {t.pillaged}
            </dd>
          </>
        )}
        {t.fertile && Object.keys(t.fertile).length > 0 && (
          <>
            <dt>Fertile</dt>
            <dd>
              <Rich
                text={Object.entries(t.fertile)
                  .map(([y, n]) => `+${n} ${content.entities.yield[y]?.icon ?? y}`)
                  .join(' ')}
              />{' '}
              left by disasters
            </dd>
          </>
        )}
        {isOnRiver(map, rivers, tile) && (
          <>
            <dt>River</dt>
            <dd>Fresh water</dd>
          </>
        )}
        {terrain.water && (
          <>
            <dt>Water</dt>
            <dd>{terrain.deepWater ? 'Deep: needs Cartography' : 'Shallow'}</dd>
          </>
        )}
      </dl>
      {lines.length > 0 ? (
        <ul className="yields">
          {lines.map((l) => (
            <li key={l} className="mono">
              <Rich text={l} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">
          No yields. {t.elevation === 'mountain' ? 'Mountains block movement and sight.' : ''}
        </p>
      )}
      <p className="hint total">
        {Object.entries(breakdown.total).map(([id, v]) => (
          <span key={id} className="total-yield">
            <Icon name={id} size={18} /> {formatFixed(v)}
          </span>
        ))}
      </p>
    </aside>
  );
}
