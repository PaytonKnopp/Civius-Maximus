import { type CompiledContent, resolveText } from '@cx/content';
import {
  computeTileYields,
  explainYields,
  formatFixed,
  isOnRiver,
  type MapState,
  neighbors,
} from '@cx/engine';

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
      <dl className="facts">
        <dt>Tile</dt>
        <dd className="mono">
          {tile % map.width}, {Math.floor(tile / map.width)}
        </dd>
        {resource && (
          <>
            <dt>Resource</dt>
            <dd>
              {name(resource.name)}{' '}
              <span className={`chip ${resource.class}`}>{resource.class}</span>
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
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">
          No yields. {t.elevation === 'mountain' ? 'Mountains block movement and sight.' : ''}
        </p>
      )}
      <p className="hint total">
        {Object.entries(breakdown.total)
          .map(([id, v]) => `${content.entities.yield[id]?.icon ?? ''} ${formatFixed(v)}`)
          .join('   ')}
      </p>
    </aside>
  );
}
