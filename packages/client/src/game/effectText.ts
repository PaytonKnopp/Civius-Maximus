import { type CompiledContent, resolveText } from '@cx/content';
import { withArticle } from '@cx/engine';

/**
 * Plain-language lines for content effects (`{ effect, params, target, condition }`), so the
 * Civilopedia, the Government screen and notices can say what a building, policy, belief or
 * ability actually does, straight from the rules. Every effect and condition the base game has
 * reads as a sentence in the game's own words ("+1 culture in every settlement with a
 * Monument"); one this file doesn't know (a mod's, or a new one) falls back to its name and
 * values in words, never as raw data. A test (civilopedia.test.ts) reads every line the base
 * content produces.
 */

interface EffectLike {
  effect: string;
  params?: Record<string, unknown> | undefined;
  target?: { scope?: string; owner?: string } | undefined;
  condition?: unknown;
}

type Bag = Record<string, unknown>;

const names = new WeakMap<CompiledContent, Map<string, string>>();

/** Every content id's display name. */
function nameIndex(content: CompiledContent): Map<string, string> {
  let map = names.get(content);
  if (map) return map;
  map = new Map();
  for (const group of Object.values(content.entities)) {
    for (const [id, def] of Object.entries(group as Record<string, { name?: string }>)) {
      if (def && typeof def.name === 'string') map.set(id, resolveText(content, def.name));
    }
  }
  names.set(content, map);
  return map;
}

const humanize = (id: string) => {
  const s = id
    .replace(/^[a-z]+_(?=[a-z])/i, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** "+3", "−2": a true minus sign, like the rest of the game's numbers. */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const signedPct = (n: number) => `${signed(n)}%`;
/** "A", "A or B", "A, B or C". */
const join = (parts: string[], word: 'and' | 'or') => {
  const list = [...new Set(parts.filter(Boolean))];
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} ${word} ${list[list.length - 1]}`;
};
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const isBag = (v: unknown): v is Bag => !!v && typeof v === 'object' && !Array.isArray(v);

/** "Mines", "Quarries", "Fishing Boats", "Musketmen": a name for more than one of the thing. */
function pluralName(name: string): string {
  if (/us$/.test(name)) return `${name}es`;
  if (/(?:s|Infantry|Cavalry|Artillery|Shot|Fish|Sheep|Deer)$/.test(name)) return name;
  if (/man$/.test(name)) return name.replace(/man$/, 'men');
  if (/[^aeiou]y$/.test(name)) return name.replace(/y$/, 'ies');
  if (/(?:ch|sh|x|z)$/.test(name)) return `${name}es`;
  return `${name}s`;
}

export function effectLines(
  content: CompiledContent,
  effects: readonly EffectLike[] | undefined,
  /** `local`: the effects of something that sits in one settlement (a building's local
   * effects, a governor, a town specialization), so "in every settlement" would be wrong. */
  opts: { local?: boolean } = {},
): string[] {
  if (!effects) return [];
  /** "Light cavalry and heavy cavalry": a list of names as the start of a sentence. */
  const sentence = (text: string) => {
    const lower = text.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };
  const idx = nameIndex(content);
  /** An id's name (ids the content doesn't have read as words). */
  const nm = (v: unknown): string =>
    typeof v === 'string' ? (idx.get(v) ?? humanize(v)) : typeof v === 'number' ? String(v) : '';
  const nmList = (v: unknown, word: 'and' | 'or' = 'or') => join(asList(v).map(nm), word);
  const yieldName = (v: unknown) => nm(v).toLowerCase();
  /** "+2 gold and +1 culture" from a yield map. */
  const yieldMap = (v: unknown) =>
    isBag(v)
      ? join(
          Object.entries(v)
            .filter(([, n]) => typeof n === 'number' && n !== 0)
            .map(([y, n]) => `${signed(n as number)} ${yieldName(y)}`),
          'and',
        )
      : '';

  /** A tile matcher ("per" of an adjacency) as the kind of tile it counts: "Desert tile". */
  const tileMatch = (m: unknown, many = false): string => {
    if (!isBag(m)) return many ? 'tiles' : 'tile';
    const tile = many ? 'tiles' : 'tile';
    const one = (v: unknown) => (many ? pluralName(nmList(v)) : nmList(v));
    if (m.district !== undefined)
      return m.district === true ? (many ? 'districts' : 'district') : one(m.district);
    if (m.wonder !== undefined)
      return m.wonder === true ? (many ? 'wonders' : 'wonder') : nmList(m.wonder);
    if (m.naturalWonder) return many ? 'natural wonders' : 'natural wonder';
    if (m.improvement !== undefined)
      return m.improvement === true ? `improved ${tile}` : one(m.improvement);
    if (m.resource !== undefined)
      return m.resource === true
        ? many
          ? 'resources'
          : 'resource'
        : `${nmList(m.resource)} ${many ? 'resources' : 'resource'}`;
    if (m.resourceClass !== undefined)
      return `${String(m.resourceClass)} ${many ? 'resources' : 'resource'}`;
    if (m.cityCenter) return many ? 'city centers' : 'city center';
    if (m.river) return `river ${tile}`;
    const kinds = [m.feature, m.terrain, m.elevation].filter((x) => x !== undefined);
    if (kinds.length > 0) return `${kinds.map((k) => nmList(k)).join(' ')} ${tile}`;
    return tile;
  };

  /**
   * A condition, split into where it holds and when: `place` narrows the settlements or tiles
   * ("with a Monument", "on a river"), `noun` replaces "settlement" or "tiles" ("town",
   * "Mines"), `only` replaces the whole place ("in the capital"), `when` is about the player
   * ("while celebrating").
   */
  interface Cond {
    noun?: string;
    place: string[];
    only?: string;
    when: string[];
  }
  const cond = (c: unknown, tiles: boolean): Cond => {
    const out: Cond = { place: [], when: [] };
    if (!isBag(c)) return out;
    const [key, v] = Object.entries(c)[0] ?? [];
    switch (key) {
      case 'all':
      case 'any': {
        const parts = asList(v).map((x) => cond(x, tiles));
        if (key === 'all') {
          for (const p of parts) {
            if (p.noun) out.noun = out.noun ?? p.noun;
            if (p.only) out.only = out.only ?? p.only;
            out.place.push(...p.place);
            out.when.push(...p.when);
          }
        } else {
          // Alternatives of one kind read as a list ("beside a river or next to a Lake").
          const places = parts.map((p) => p.only ?? [p.noun, ...p.place].filter(Boolean).join(' '));
          const whens = parts.flatMap((p) => p.when);
          if (places.some(Boolean)) out.place.push(join(places.filter(Boolean), 'or'));
          if (whens.length) out.when.push(join(whens, 'or'));
        }
        return out;
      }
      case 'not': {
        const inner = isBag(v) ? Object.entries(v)[0] : undefined;
        if (inner?.[0] === 'settlement_units_trained_below')
          out.place.push(
            `that has trained ${inner[1]} or more soldier${inner[1] === 1 ? '' : 's'}`,
          );
        else if (
          inner?.[0] === 'settlement_has_building' ||
          inner?.[0] === 'settlement_has_district'
        )
          out.place.push(`without ${withArticle(nmList(inner[1]))}`);
        else if (inner?.[0] === 'settlement_is_capital') out.place.push('other than the capital');
        else {
          const p = cond(v, tiles);
          const what = p.only ?? [p.noun, ...p.place].filter(Boolean).join(' ');
          if (what) out.place.push(`not ${what}`);
          if (p.when.length)
            out.when.push(`unless ${join(p.when, 'and').replace(/^(while|once|under|from) /, '')}`);
        }
        return out;
      }
      // Tiles
      case 'tile_terrain':
        out.noun = `${nmList(v)} tiles`;
        return out;
      case 'tile_feature':
        out.noun = v === null ? 'tiles with no feature' : `${nmList(v)} tiles`;
        return out;
      case 'tile_elevation':
        out.noun = nmList(v);
        return out;
      case 'tile_has_resource':
        out.noun = v === true ? 'tiles with a resource' : `${nmList(v)} tiles`;
        return out;
      case 'tile_resource_class':
        out.noun = `${String(v)} resources`;
        return out;
      case 'tile_has_improvement':
        out.noun =
          v === true
            ? 'improved tiles'
            : join(
                asList(v).map((x) => pluralName(nm(x))),
                'or',
              );
        return out;
      case 'tile_on_river':
        out.place.push(v ? 'beside a river' : 'away from rivers');
        return out;
      case 'tile_coastal':
        out.place.push(v ? 'on the coast' : 'away from the coast');
        return out;
      case 'tile_owned_by_self':
        return out;
      case 'tile_adjacent_to': {
        const min = isBag(v) && typeof v.min === 'number' ? v.min : 1;
        out.place.push(
          min > 1
            ? `next to ${min} or more ${tileMatch(v, true)}`
            : `next to ${withArticle(tileMatch(v))}`,
        );
        return out;
      }
      case 'tile_city_center':
        if (v) out.noun = 'city centers';
        else out.place.push('outside city centers');
        return out;
      // Settlements
      case 'settlement_is_capital':
        if (v) out.only = 'in the capital';
        else out.place.push('other than the capital');
        return out;
      case 'settlement_kind':
        out.noun = String(v);
        return out;
      case 'settlement_population_at_least':
        out.place.push(`with ${v} or more citizens`);
        return out;
      case 'settlement_has_building':
      case 'settlement_has_district':
        out.place.push(`with ${withArticle(nmList(v))}`);
        return out;
      case 'settlement_has_governor':
        out.place.push(`governed by ${nmList(v)}`);
        return out;
      case 'settlement_on_river':
        out.place.push(v ? 'on a river' : 'away from rivers');
        return out;
      case 'settlement_units_trained_below':
        out.place.push(`that has trained fewer than ${v} soldier${v === 1 ? '' : 's'}`);
        return out;
      case 'settlement_on_home_continent':
        out.place.push(v ? 'on your home continent' : 'off your home continent');
        return out;
      // The player
      case 'has_tech':
      case 'has_civic':
        out.when.push(`once you have ${nm(v)}`);
        return out;
      case 'government_is':
        out.when.push(`under ${nmList(v)}`);
        return out;
      case 'celebrating':
        out.when.push(v ? 'while celebrating' : 'while not celebrating');
        return out;
      case 'era_at_least':
        out.when.push(`from the ${nm(v)} era on`);
        return out;
      default:
        // A condition this file doesn't know: its name in words.
        if (key)
          out.when.push(
            `when ${humanize(key).toLowerCase()}${typeof v === 'string' || typeof v === 'number' ? ` ${nm(v)}` : ''}`,
          );
        return out;
    }
  };

  /** Which items a production or cost effect is about: "soldiers", "Settlers", "wonders". */
  const toward = (t: unknown): string => {
    if (!isBag(t)) return 'everything';
    if (t.unit !== undefined) {
      const list = asList(t.unit).map(nm);
      return list.length === 1 ? pluralName(list[0]!) : `${join(list, 'and')} units`;
    }
    if (t.unitClass !== undefined) return `${nmList(t.unitClass, 'and').toLowerCase()} units`;
    if (t.building !== undefined)
      return join(
        asList(t.building).map((b) => pluralName(nm(b))),
        'and',
      );
    if (t.district !== undefined)
      return join(
        asList(t.district).map((d) => pluralName(nm(d))),
        'and',
      );
    if (t.wonder !== undefined) return join(asList(t.wonder).map(nm), 'and');
    if (t.military) return 'soldiers';
    if (typeof t.kind === 'string')
      return (
        {
          unit: 'units',
          building: 'buildings',
          district: 'districts',
          wonder: 'wonders',
          project: 'projects',
        }[t.kind] ?? `${t.kind}s`
      );
    return 'everything';
  };

  return collapseLadders(effects).map((e) => tidy(typeof e === 'string' ? e : one(e)));

  /**
   * "+1 science once 1 soldier was trained here", "... once 2 were"... up to 10, as content
   * writes "for each soldier trained here, up to 10": one line instead of ten.
   */
  function collapseLadders(list: readonly EffectLike[]): (EffectLike | string)[] {
    const step = (e: EffectLike): number | undefined => {
      const not = isBag(e.condition) ? e.condition.not : undefined;
      const n = isBag(not) ? not.settlement_units_trained_below : undefined;
      return typeof n === 'number' ? n : undefined;
    };
    const sameBut = (a: EffectLike, b: EffectLike) =>
      a.effect === b.effect &&
      JSON.stringify(a.params) === JSON.stringify(b.params) &&
      JSON.stringify(a.target) === JSON.stringify(b.target);
    const out: (EffectLike | string)[] = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      let j = i;
      while (
        step(e) === 1 &&
        e.effect === 'modify_yield' &&
        j + 1 < list.length &&
        sameBut(e, list[j + 1]!) &&
        step(list[j + 1]!) === j - i + 2
      )
        j++;
      if (j > i) {
        const p = (e.params ?? {}) as Bag;
        const amount =
          typeof p.amount === 'number' ? signed(p.amount) : signedPct(Number(p.percent));
        out.push(
          `${amount} ${yieldName(p.yield)} for each soldier a settlement has trained, up to ${j - i + 1}`,
        );
        i = j;
      } else out.push(e);
    }
    return out;
  }

  /** No doubled spaces, none before punctuation. */
  function tidy(line: string): string {
    return line
      .replace(/\s+/g, ' ')
      .replace(/ ([,.;:])/g, '$1')
      .trim();
  }

  function one(e: EffectLike): string {
    const p = (e.params ?? {}) as Bag;
    const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : undefined);
    const scope = e.target?.scope;
    const c = cond(e.condition, scope === 'tiles');
    const when = c.when.length ? ` ${c.when.join(' and ')}` : '';
    /** Where a settlement effect holds: "in every settlement with a Monument". */
    const inSettlements = () =>
      opts.local
        ? c.only
          ? 'if this is the capital'
          : c.noun || c.place.length
            ? `in a ${[c.noun ?? 'settlement', ...c.place].join(' ')}`
            : ''
        : (c.only ?? `in every ${[c.noun ?? 'settlement', ...c.place].join(' ')}`);
    /** Where a tile effect holds: "on Mines", "on Farms beside a river". */
    const onTiles = () =>
      c.noun || c.place.length
        ? `${c.noun === 'city centers' ? 'in' : 'on'} ${[c.noun ?? 'tiles', ...c.place].join(' ')}`
        : e.target?.owner === 'any'
          ? 'on every tile'
          : 'on every tile of yours';
    const where =
      scope === 'settlements'
        ? ` ${inSettlements()}${when}`
        : scope === 'tiles'
          ? ` ${onTiles()}${when}`
          : // Player and unit effects: only the "when", and any place the condition names.
            `${c.only ? ` ${c.only}` : c.noun || c.place.length ? ` in every ${[c.noun ?? 'settlement', ...c.place].join(' ')}` : ''}${when}`;
    const amount = num('amount');
    const percent = num('percent');
    const less = (n: number) => `${Math.abs(n)}% ${n < 0 ? 'less' : 'more'}`;
    switch (e.effect) {
      case 'modify_yield': {
        const y = yieldName(p.yield);
        return percent !== undefined
          ? `${signedPct(percent)} ${y}${where}`
          : `${signed(amount ?? 0)} ${y}${where}`;
      }
      case 'yield_per_adjacent': {
        const every = num('every') ?? 1;
        const per =
          every > 1
            ? `every ${every} adjacent ${tileMatch(p.per, true)}`
            : `each adjacent ${tileMatch(p.per)}`;
        return `${signed(amount ?? 0)} ${yieldName(p.yield)} for ${per}${c.noun || c.place.length ? `, ${onTiles()}` : ''}${when}`;
      }
      case 'modify_happiness':
        return `${signed(amount ?? 0)} happiness${where}`;
      case 'modify_production':
        return `${signedPct(percent ?? 0)} production toward ${toward(p.toward)}${where}`;
      case 'modify_item_cost': {
        const what = toward(p.toward);
        const What = /^[a-z]/.test(what) ? sentence(what) : what;
        // "The first soldier trained in every settlement is free" (Qin's ability).
        const first = isBag(e.condition) ? e.condition.settlement_units_trained_below : undefined;
        if (percent === -100 && typeof first === 'number')
          return first === 1
            ? `The first of your ${what} trained in every settlement is free`.replace(
                'of your soldiers',
                'soldier',
              )
            : `The first ${first} ${what} trained in every settlement are free`;
        if (percent === -100) return `${What} are free${where}`;
        return `${What} cost ${less(percent ?? 0)}${where}`;
      }
      case 'modify_purchase_cost':
        return `Buying with gold costs ${less(percent ?? 0)}${scope === 'settlements' ? where : when}`;
      case 'modify_growth':
        return `${signedPct(percent ?? 0)} growth${where}`;
      case 'modify_loyalty':
        return `${signed(amount ?? 0)} loyalty a turn${where}`;
      case 'modify_loyalty_pressure':
        return `${signedPct(percent ?? 0)} loyalty pressure from your citizens${where}`;
      case 'modify_border_growth':
        return `${signedPct(percent ?? 0)} border growth${where}`;
      case 'modify_boost':
        return `Boosts give ${less(percent ?? 0)} of a tech or civic's cost${where}`;
      case 'modify_settlement_limit':
        return `${signed(amount ?? 0)} settlement limit${where}`;
      case 'modify_unit_upkeep':
        return `Unit upkeep costs ${less(percent ?? 0)}${where}`;
      case 'enable_embark':
        return `Land units can embark onto shallow water${where}`;
      case 'modify_strength': {
        const who = p.unitClass
          ? `for ${nmList(p.unitClass, 'and').toLowerCase()} units`
          : p.unit
            ? `for ${join(asList(p.unit).map(nm), 'and')} units`
            : 'for every unit';
        const vs = isBag(p.vs)
          ? join(
              [
                Array.isArray(p.vs.classes) ? `${nmList(p.vs.classes).toLowerCase()} units` : '',
                p.vs.settlement ? 'settlements' : '',
                p.vs.ranged ? 'ranged attacks' : '',
                p.vs.wounded ? 'wounded units' : '',
                p.vs.tradePartner ? 'civilizations you trade with' : '',
              ],
              'and',
            )
          : '';
        const on = isBag(p.on)
          ? join([...asList(p.on.features).map(nm), ...asList(p.on.elevations).map(nm)], 'or')
          : '';
        const bits = [
          who,
          p.when === 'attack'
            ? vs
              ? `when attacking ${vs}`
              : 'when attacking'
            : p.when === 'defend'
              ? vs
                ? `when defending against ${vs}`
                : 'when defending'
              : vs
                ? `against ${vs}`
                : '',
          on ? `on ${on}` : '',
          num('afterDeclaringWar')
            ? `for ${num('afterDeclaringWar')} turns after you declare a war`
            : '',
        ].filter(Boolean);
        return `${signed(amount ?? 0)} strength ${bits.join(' ')}${where}`;
      }
      case 'grant_promotion': {
        const who = p.unitClass
          ? `${sentence(nmList(p.unitClass, 'and'))} units`
          : p.domain === 'sea'
            ? 'Ships'
            : p.domain === 'air'
              ? 'Aircraft'
              : p.domain === 'land'
                ? 'Land units'
                : 'Units';
        return `${who} start with the ${nm(p.promotion)} promotion${when}`;
      }
      case 'on_capture': {
        const bits = [
          num('goldPerCitizen') ? `${num('goldPerCitizen')} gold for each of its citizens` : '',
          p.healUnits ? 'every unit of yours heals fully' : '',
          num('boostsPerDistrict')
            ? `${num('boostsPerDistrict')} boost${num('boostsPerDistrict') === 1 ? '' : 's'} for each of its districts`
            : '',
        ].filter(Boolean);
        return `When you capture a settlement: ${bits.join('; ') || 'nothing more'}${when}`;
      }
      case 'capture_on_kill':
        return `${percent ?? 0}% chance to capture a defeated ${nmList(p.unitClass).toLowerCase()} unit instead of destroying it${when}`;
      case 'free_building':
        return `New settlements start with ${withArticle(nm(p.building))}${when}`;
      case 'district_neighbor_bonus':
        return `Districts get ${signed(amount ?? 0)} more from each neighboring district${when}`;
      case 'adjacency_percent':
        return `${signedPct(percent ?? 0)} to the adjacency bonuses of ${join(
          asList(p.district).map((d) => pluralName(nm(d))),
          'and',
        )}${when}`;
      case 'yield_per_appeal':
        return `+1 ${yieldName(p.yield)} for every ${num('per') ?? 1} appeal of its tiles (those with ${num('minAppeal') ?? 0} or more)${where}`;
      case 'extra_adjacency': {
        const a = isBag(p.adjacency) ? p.adjacency : {};
        const every = typeof a.every === 'number' ? a.every : 1;
        const what = a.self
          ? `on ${withArticle(tileMatch(a.self))}`
          : every > 1
            ? `for every ${every} adjacent ${tileMatch(a.per, true)}`
            : `for each adjacent ${tileMatch(a.per)}`;
        return `${join(
          asList(p.district).map((d) => pluralName(nm(d))),
          'and',
        )}: ${signed(typeof a.amount === 'number' ? a.amount : 0)} ${yieldName(a.yield)} ${what}${when}`;
      }
      case 'free_unit_on_district':
        return `A free ${nmList(p.unitClass).toLowerCase()} unit (the strongest you can train) with every new ${nmList(p.district)}${when}`;
      case 'extra_policy_slot':
        return `${signed(amount ?? 1)} ${String(p.slot)} policy slot${(amount ?? 1) === 1 ? '' : 's'}${where}`;
      case 'extra_trade_route':
        return `${signed(amount ?? 1)} trade route${(amount ?? 1) === 1 ? '' : 's'}${where}`;
      case 'trade_route_bonus': {
        const routes = p.international
          ? 'Your trade routes to other civilizations'
          : 'Your trade routes';
        const origin = yieldMap(p.origin);
        const destination = yieldMap(p.destination);
        const terrain = isBag(p.perOriginTerrain)
          ? `${yieldMap(p.perOriginTerrain.yields)} for each ${nm(p.perOriginTerrain.terrain)} tile the settlement they start from owns`
          : '';
        const bits = [
          origin ? `${origin} where they start` : '',
          destination ? `${destination} where they end` : '',
          terrain,
        ].filter(Boolean);
        return `${routes} give ${join(bits, 'and') || 'nothing more'}${when}`;
      }
      case 'trade_reveals':
        return `Starting a trade route reveals the land within ${num('radius') ?? 1} tiles of where it ends${when}`;
      case 'influence_per_deal':
        return `${signed(amount ?? 0)} influence a turn for every deal of yours with payments running${when}`;
      case 'road_to_capital':
        return `New settlements get a road to the capital${when}`;
      case 'great_person_points':
        return `${signed(amount ?? 0)} ${nm(p.class)} point${amount === 1 ? '' : 's'} a turn${where}`;
      case 'great_person_points_percent':
        return `${signedPct(percent ?? 0)} ${nm(p.class)} points${where}`;
      case 'commander_bonus': {
        const bits = [
          num('strength') ? `give ${signed(num('strength')!)} more strength` : '',
          num('xpPercent') ? `earn experience ${num('xpPercent')}% faster` : '',
        ].filter(Boolean);
        return `Commanders ${join(bits, 'and') || 'are unchanged'}${when}`;
      }
      case 'grant_envoys':
        return `${amount ?? 1} envoy${(amount ?? 1) === 1 ? '' : 's'} to send, once${when}`;
      case 'yield_per_follower': {
        const per = num('per') ?? 1;
        return `${signed(amount ?? 0)} ${yieldName(p.yield)} in the holy city for every ${per === 1 ? 'settlement' : `${per} settlements`} following the religion${when}`;
      }
      case 'diplomatic_favor':
        return `${signed(amount ?? 0)} diplomatic favor a turn${where}`;
      case 'diplomatic_points':
        return `${signed(amount ?? 0)} diplomatic victory point${Math.abs(amount ?? 0) === 1 ? '' : 's'}${where}`;
      case 'purchase_with_faith':
        return `${p.kind === 'unit' ? 'Units' : 'Buildings'} can also be bought with faith${when}`;
      case 'pillage_bonus':
        return `Pillaging and plundering also give ${yieldMap(p.yields) || 'nothing more'}${when}`;
      default: {
        // An effect this file doesn't know (a mod's): its name and plain values in words.
        const rest = Object.entries(p)
          .filter(
            ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
          )
          .map(([k, v]) =>
            typeof v === 'boolean'
              ? v
                ? humanize(k).toLowerCase()
                : ''
              : `${humanize(k).toLowerCase()} ${typeof v === 'number' ? v : nm(v)}`,
          )
          .filter(Boolean)
          .join(', ');
        return `${humanize(e.effect)}${rest ? `: ${rest}` : ''}${where}`;
      }
    }
  }
}
