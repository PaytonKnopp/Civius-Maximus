import type { PathSegment } from './diagnostics';
import type { Adjacency, Condition, Effect, TileMatch, Toward } from './schema/effects';
import type { AnyEntity, EntityType, Goal, Placement } from './schema/entities';

/** A field that points at other content. Checked after all packages and patches are loaded. */
export interface Ref {
  path: PathSegment[];
  kind: EntityType | 'string';
  id: string;
}

type Refs = Ref[];

function ids(
  out: Refs,
  kind: EntityType,
  value: string | string[] | undefined,
  path: PathSegment[],
) {
  if (value === undefined) return;
  if (typeof value === 'string') out.push({ path, kind, id: value });
  else value.forEach((id, i) => out.push({ path: [...path, i], kind, id }));
}

function yieldKeys(out: Refs, map: Record<string, number> | undefined, path: PathSegment[]) {
  for (const key of Object.keys(map ?? {}).sort())
    out.push({ path: [...path, key], kind: 'yield', id: key });
}

/** A list of ids, or `true` meaning "any" (no reference). */
const listOrAny = (v: string | string[] | true | undefined) => (v === true ? undefined : v);

function tileMatch(out: Refs, m: TileMatch, path: PathSegment[]) {
  ids(out, 'terrain', m.terrain, [...path, 'terrain']);
  ids(out, 'feature', m.feature, [...path, 'feature']);
  ids(out, 'resource', listOrAny(m.resource), [...path, 'resource']);
  ids(out, 'improvement', listOrAny(m.improvement), [...path, 'improvement']);
  ids(out, 'district', listOrAny(m.district), [...path, 'district']);
  ids(out, 'wonder', listOrAny(m.wonder), [...path, 'wonder']);
}

function adjacencyRefs(out: Refs, list: readonly Adjacency[], path: PathSegment[]) {
  list.forEach((a, i) => {
    out.push({ path: [...path, i, 'yield'], kind: 'yield', id: a.yield });
    if (a.per) tileMatch(out, a.per, [...path, i, 'per']);
    if (a.self) tileMatch(out, a.self, [...path, i, 'self']);
  });
}

function placementRefs(out: Refs, p: Placement, path: PathSegment[]) {
  ids(out, 'terrain', p.terrains, [...path, 'terrains']);
  ids(out, 'feature', p.features, [...path, 'features']);
  if (p.self) tileMatch(out, p.self, [...path, 'self']);
  for (const key of ['nextTo', 'nextToAny', 'notNextTo'] as const) {
    p[key].forEach((m, i) => tileMatch(out, m, [...path, key, i]));
  }
}

function condition(out: Refs, c: Condition, path: PathSegment[]) {
  if ('all' in c) c.all.forEach((x, i) => condition(out, x, [...path, 'all', i]));
  else if ('any' in c) c.any.forEach((x, i) => condition(out, x, [...path, 'any', i]));
  else if ('not' in c) condition(out, c.not, [...path, 'not']);
  else if ('tile_terrain' in c) ids(out, 'terrain', c.tile_terrain, [...path, 'tile_terrain']);
  else if ('tile_feature' in c)
    ids(out, 'feature', c.tile_feature ?? undefined, [...path, 'tile_feature']);
  else if ('tile_has_resource' in c && c.tile_has_resource !== true)
    ids(out, 'resource', c.tile_has_resource, [...path, 'tile_has_resource']);
  else if ('tile_adjacent_to' in c)
    tileMatch(out, c.tile_adjacent_to, [...path, 'tile_adjacent_to']);
  else if ('tile_has_improvement' in c && c.tile_has_improvement !== true)
    ids(out, 'improvement', c.tile_has_improvement, [...path, 'tile_has_improvement']);
  else if ('settlement_has_building' in c)
    ids(out, 'building', c.settlement_has_building, [...path, 'settlement_has_building']);
  else if ('has_tech' in c) ids(out, 'tech', c.has_tech, [...path, 'has_tech']);
  else if ('has_civic' in c) ids(out, 'civic', c.has_civic, [...path, 'has_civic']);
  else if ('government_is' in c)
    ids(out, 'government', c.government_is, [...path, 'government_is']);
  else if ('era_at_least' in c) ids(out, 'era', c.era_at_least, [...path, 'era_at_least']);
}

function towardRefs(out: Refs, t: Toward, at: PathSegment[]) {
  ids(out, 'unitClass', t.unitClass, [...at, 'unitClass']);
  ids(out, 'unit', t.unit, [...at, 'unit']);
  ids(out, 'building', t.building, [...at, 'building']);
  ids(out, 'district', t.district, [...at, 'district']);
  ids(out, 'wonder', t.wonder, [...at, 'wonder']);
}

export function effectRefs(out: Refs, e: Effect, path: PathSegment[]) {
  if (e.effect === 'modify_yield' || e.effect === 'yield_per_adjacent')
    out.push({ path: [...path, 'params', 'yield'], kind: 'yield', id: e.params.yield });
  if (e.effect === 'yield_per_adjacent') tileMatch(out, e.params.per, [...path, 'params', 'per']);
  const at = [...path, 'params'];
  switch (e.effect) {
    case 'modify_production':
    case 'modify_item_cost':
      towardRefs(out, e.params.toward, [...at, 'toward']);
      break;
    case 'modify_strength':
      ids(out, 'unitClass', e.params.unitClass, [...at, 'unitClass']);
      ids(out, 'unitClass', e.params.vs?.classes, [...at, 'vs', 'classes']);
      ids(out, 'feature', e.params.on?.features, [...at, 'on', 'features']);
      break;
    case 'grant_promotion':
      ids(out, 'promotion', e.params.promotion, [...at, 'promotion']);
      ids(out, 'unitClass', e.params.unitClass, [...at, 'unitClass']);
      break;
    case 'capture_on_kill':
      ids(out, 'unitClass', e.params.unitClass, [...at, 'unitClass']);
      break;
    case 'free_unit_on_district':
      ids(out, 'district', e.params.district, [...at, 'district']);
      ids(out, 'unitClass', e.params.unitClass, [...at, 'unitClass']);
      break;
    case 'trade_route_bonus':
      yieldKeys(out, e.params.origin, [...at, 'origin']);
      yieldKeys(out, e.params.destination, [...at, 'destination']);
      if (e.params.perOriginTerrain) {
        ids(out, 'terrain', e.params.perOriginTerrain.terrain, [
          ...at,
          'perOriginTerrain',
          'terrain',
        ]);
        yieldKeys(out, e.params.perOriginTerrain.yields, [...at, 'perOriginTerrain', 'yields']);
      }
      break;
    case 'great_person_points':
    case 'great_person_points_percent':
      ids(out, 'greatPersonClass', e.params.class, [...at, 'class']);
      break;
    case 'free_building':
      ids(out, 'building', e.params.building, [...at, 'building']);
      break;
    case 'extra_adjacency':
      ids(out, 'district', e.params.district, [...at, 'district']);
      adjacencyRefs(out, [e.params.adjacency], [...at, 'adjacency']);
      break;
    default:
      break;
  }
  if (e.condition) condition(out, e.condition, [...path, 'condition']);
}

function effectList(out: Refs, effects: readonly Effect[], path: PathSegment[]) {
  effects.forEach((e, i) => effectRefs(out, e, [...path, i]));
}

function uniqueRefs(
  out: Refs,
  kind: 'unit' | 'building' | 'district' | 'improvement',
  entity: { civ?: string | undefined; replaces?: string | undefined },
) {
  ids(out, 'civ', entity.civ, ['civ']);
  ids(out, kind, entity.replaces, ['replaces']);
}

function requirements(
  out: Refs,
  entity: { requiresTech?: string | undefined; requiresCivic?: string | undefined },
) {
  ids(out, 'tech', entity.requiresTech, ['requiresTech']);
  ids(out, 'civic', entity.requiresCivic, ['requiresCivic']);
}

function goalRefs(out: Refs, g: Goal, path: PathSegment[]) {
  switch (g.kind) {
    case 'units':
      ids(out, 'unit', g.unit, [...path, 'unit']);
      ids(out, 'unitClass', g.unitClass, [...path, 'unitClass']);
      break;
    case 'improvements':
      ids(out, 'improvement', g.improvement, [...path, 'improvement']);
      break;
    case 'buildings':
      ids(out, 'building', g.building, [...path, 'building']);
      break;
    case 'government':
      ids(out, 'government', g.government, [...path, 'government']);
      break;
    default:
      break;
  }
}

/** Every `@key` string anywhere in the entity is a reference to display text. */
function stringRefs(out: Refs, value: unknown, path: PathSegment[]) {
  if (typeof value === 'string') {
    if (value.startsWith('@')) out.push({ path, kind: 'string', id: value.slice(1) });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => stringRefs(out, v, [...path, i]));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) stringRefs(out, v, [...path, k]);
  }
}

export function collectRefs(entity: AnyEntity): Ref[] {
  const out: Refs = [];
  switch (entity.type) {
    case 'yield':
      break;
    case 'terrain':
      yieldKeys(out, entity.yields, ['yields']);
      break;
    case 'feature':
      yieldKeys(out, entity.yields, ['yields']);
      ids(out, 'terrain', entity.validTerrains, ['validTerrains']);
      break;
    case 'resource':
      yieldKeys(out, entity.yields, ['yields']);
      ids(out, 'terrain', entity.validTerrains, ['validTerrains']);
      ids(out, 'feature', entity.validFeatures, ['validFeatures']);
      break;
    case 'ability':
      effectList(out, entity.effects, ['effects']);
      break;
    case 'mapScript':
    case 'mapSize':
      break;
    case 'unitClass':
      entity.bonuses.forEach((b, i) => ids(out, 'unitClass', b.vs, ['bonuses', i, 'vs']));
      break;
    case 'unit':
      out.push({ path: ['class'], kind: 'unitClass', id: entity.class });
      requirements(out, entity);
      uniqueRefs(out, 'unit', entity);
      yieldKeys(out, entity.killYields, ['killYields']);
      break;
    case 'improvement':
      requirements(out, entity);
      uniqueRefs(out, 'improvement', entity);
      adjacencyRefs(out, entity.adjacency, ['adjacency']);
      yieldKeys(out, entity.yields, ['yields']);
      ids(out, 'resource', entity.resources, ['resources']);
      entity.sites.forEach((site, i) => {
        ids(out, 'terrain', site.terrains, ['sites', i, 'terrains']);
        ids(out, 'feature', site.features, ['sites', i, 'features']);
      });
      break;
    case 'building':
      yieldKeys(out, entity.yields, ['yields']);
      requirements(out, entity);
      ids(out, 'building', entity.requiresBuilding, ['requiresBuilding']);
      ids(out, 'district', entity.district, ['district']);
      effectList(out, entity.localEffects, ['localEffects']);
      effectList(out, entity.effects, ['effects']);
      uniqueRefs(out, 'building', entity);
      break;
    case 'district':
      uniqueRefs(out, 'district', entity);
      yieldKeys(out, entity.yields, ['yields']);
      yieldKeys(out, entity.specialistYields, ['specialistYields']);
      adjacencyRefs(out, entity.adjacency, ['adjacency']);
      placementRefs(out, entity.placement, ['placement']);
      effectList(out, entity.localEffects, ['localEffects']);
      effectList(out, entity.effects, ['effects']);
      requirements(out, entity);
      break;
    case 'wonder':
      yieldKeys(out, entity.yields, ['yields']);
      ids(out, 'era', entity.era, ['era']);
      placementRefs(out, entity.placement, ['placement']);
      effectList(out, entity.localEffects, ['localEffects']);
      effectList(out, entity.effects, ['effects']);
      requirements(out, entity);
      break;
    case 'project':
      ids(out, 'feature', entity.clears, ['clears']);
      yieldKeys(out, entity.reward, ['reward']);
      requirements(out, entity);
      break;
    case 'specialization':
      effectList(out, entity.localEffects, ['localEffects']);
      effectList(out, entity.effects, ['effects']);
      requirements(out, entity);
      break;
    case 'promotion':
      ids(out, 'unitClass', entity.classes, ['classes']);
      ids(out, 'promotion', entity.requires, ['requires']);
      entity.strength.forEach((b, i) => {
        ids(out, 'unitClass', b.vs?.classes, ['strength', i, 'vs', 'classes']);
        ids(out, 'feature', b.on?.features, ['strength', i, 'on', 'features']);
      });
      break;
    case 'civ':
      if (entity.ability) effectList(out, entity.ability.effects, ['ability', 'effects']);
      break;
    case 'era':
      break;
    case 'leader':
      out.push({ path: ['civ'], kind: 'civ', id: entity.civ });
      effectList(out, entity.ability.effects, ['ability', 'effects']);
      entity.agenda.rules.forEach((r, i) =>
        ids(out, 'unitClass', r.unitClass, ['agenda', 'rules', i, 'unitClass']),
      );
      break;
    case 'tech':
    case 'civic':
      ids(out, 'era', entity.era, ['era']);
      ids(out, entity.type, entity.requires, ['requires']);
      if (entity.boost) goalRefs(out, entity.boost.goal, ['boost', 'goal']);
      effectList(out, entity.effects, ['effects']);
      break;
    case 'government':
      ids(out, 'civic', entity.requiresCivic, ['requiresCivic']);
      effectList(out, entity.effects, ['effects']);
      break;
    case 'policy':
      ids(out, 'civic', entity.requiresCivic, ['requiresCivic']);
      ids(out, 'civic', entity.obsoletedBy, ['obsoletedBy']);
      effectList(out, entity.effects, ['effects']);
      break;
    case 'greatPersonClass':
      break;
    case 'greatPerson':
      ids(out, 'greatPersonClass', entity.class, ['class']);
      ids(out, 'era', entity.era, ['era']);
      entity.activate.forEach((a, i) => {
        if (a.kind === 'yields') yieldKeys(out, a.yields, ['activate', i, 'yields']);
        if (a.kind === 'promote') ids(out, 'promotion', a.promotion, ['activate', i, 'promotion']);
      });
      effectList(out, entity.effects, ['effects']);
      break;
    case 'rules':
      yieldKeys(out, entity.settlements.centerMinimumYields, [
        'settlements',
        'centerMinimumYields',
      ]);
      yieldKeys(out, entity.elevation.hills.yields, ['elevation', 'hills', 'yields']);
      yieldKeys(out, entity.elevation.mountain.yields, ['elevation', 'mountain', 'yields']);
      for (const key of [
        'coastTerrain',
        'oceanTerrain',
        'lakeTerrain',
        'fallbackLandTerrain',
      ] as const) {
        out.push({ path: ['mapgen', key], kind: 'terrain', id: entity.mapgen[key] });
      }
      ids(out, 'unit', entity.units.startingUnits, ['units', 'startingUnits']);
      out.push({ path: ['greatPeople', 'unit'], kind: 'unit', id: entity.greatPeople.unit });
      out.push({
        path: ['settlements', 'capitalBuilding'],
        kind: 'building',
        id: entity.settlements.capitalBuilding,
      });
      yieldKeys(out, entity.settlements.citizenWeights, ['settlements', 'citizenWeights']);
      yieldKeys(out, entity.settlements.citizenYields, ['settlements', 'citizenYields']);
      out.push({
        path: ['progress', 'startingGovernment'],
        kind: 'government',
        id: entity.progress.startingGovernment,
      });
      effectList(out, entity.progress.celebration.effects, ['progress', 'celebration', 'effects']);
      entity.camps.units.forEach((u, i) => {
        out.push({ path: ['camps', 'units', i, 'era'], kind: 'era', id: u.era });
        ids(out, 'unit', u.units, ['camps', 'units', i, 'units']);
      });
      break;
    default: {
      // Adding a content type? Teach this function which of its fields point at other content.
      const unhandled: never = entity;
      throw new Error(`collectRefs: unhandled type ${(unhandled as AnyEntity).type}`);
    }
  }
  stringRefs(out, entity, []);
  return out;
}
