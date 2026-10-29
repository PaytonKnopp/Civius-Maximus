import { type CompiledContent, resolveText } from '@cx/content';
import { CONCEPTS } from './concepts';

/**
 * The Civilopedia (docs/06-ui-ux.md, "Civilopedia"): every article is built from the content,
 * so mods show up on their own, plus a few hand-written articles on how the game plays.
 */

export type CategoryId =
  | 'concepts'
  | 'civs'
  | 'units'
  | 'buildings'
  | 'districts'
  | 'wonders'
  | 'improvements'
  | 'techs'
  | 'civics'
  | 'governments'
  | 'religion'
  | 'greatPeople'
  | 'cityStates'
  | 'map'
  | 'promotions'
  | 'world';

export const CATEGORIES: { id: CategoryId; name: string }[] = [
  { id: 'concepts', name: 'How to play' },
  { id: 'civs', name: 'Civilizations and leaders' },
  { id: 'units', name: 'Units' },
  { id: 'buildings', name: 'Buildings' },
  { id: 'districts', name: 'Districts' },
  { id: 'wonders', name: 'World wonders' },
  { id: 'improvements', name: 'Improvements' },
  { id: 'techs', name: 'Technologies' },
  { id: 'civics', name: 'Civics' },
  { id: 'governments', name: 'Governments and policies' },
  { id: 'religion', name: 'Religion' },
  { id: 'greatPeople', name: 'Great people' },
  { id: 'cityStates', name: 'City-states' },
  { id: 'map', name: 'Terrain, features and resources' },
  { id: 'promotions', name: 'Promotions' },
  { id: 'world', name: 'Governors, eras and the world' },
];

/** A run of text with links to other articles. */
export type Inline = string | { link: string; text: string };

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'facts'; rows: [string, Inline[]][] }
  | { kind: 'links'; title: string; items: Inline[] };

export interface Article {
  /** `kind:id`, e.g. `unit:unit_warrior` (concepts: `concept:growth`). */
  id: string;
  category: CategoryId;
  title: string;
  subtitle?: string | undefined;
  /** A short group label inside the category (an era, a class...). */
  group?: string | undefined;
  blocks: Block[];
}

type Entities = CompiledContent['entities'];

/** Every article, in category order, then group, then name. */
export function buildArticles(content: CompiledContent): Article[] {
  const t = (text: string) => resolveText(content, text);
  const e: Entities = content.entities;
  const ids = content.ids;
  const out: Article[] = [];
  const name = (kind: keyof Entities, id: string | undefined) => {
    if (!id) return '';
    const d = (e[kind] as Record<string, { name: string } | undefined>)[id];
    return d ? t(d.name) : id;
  };
  const link = (kind: keyof Entities, id: string | undefined): Inline[] =>
    id ? [{ link: `${kind}:${id}`, text: name(kind, id) }] : [];
  const eraName = (id: string | undefined) => (id ? name('era', id) : '');
  const yieldsText = (y: Record<string, number> | undefined) =>
    Object.entries(y ?? {})
      .filter(([, n]) => n !== 0)
      .map(
        ([k, n]) => `${n > 0 ? '+' : ''}${n} ${e.yield[k] ? t(e.yield[k]!.name).toLowerCase() : k}`,
      )
      .join(', ');
  const requires = (x: {
    requiresTech?: string | undefined;
    requiresCivic?: string | undefined;
  }) => {
    const parts: Inline[] = [];
    if (x.requiresTech) parts.push(...link('tech', x.requiresTech));
    if (x.requiresTech && x.requiresCivic) parts.push(' and ');
    if (x.requiresCivic) parts.push(...link('civic', x.requiresCivic));
    return parts;
  };
  const text = (s: string | undefined): Block[] => (s ? [{ kind: 'text', text: t(s) }] : []);
  const facts = (rows: [string, Inline[] | string | number | undefined][]): Block => ({
    kind: 'facts',
    rows: rows
      .filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
      .map(([k, v]) => [k, Array.isArray(v) ? v : [String(v)]]),
  });

  // How to play.
  for (const c of CONCEPTS)
    out.push({
      id: `concept:${c.id}`,
      category: 'concepts',
      title: c.title,
      blocks: c.paragraphs(content).map((p) => ({ kind: 'text', text: p })),
    });

  // Civilizations, with their leaders and uniques.
  const uniquesOf = (civ: string): Inline[] =>
    [
      ...ids.unit.filter((id) => e.unit[id]!.civ === civ).map((id) => ['unit', id] as const),
      ...ids.building
        .filter((id) => e.building[id]!.civ === civ)
        .map((id) => ['building', id] as const),
      ...ids.district
        .filter((id) => e.district[id]!.civ === civ)
        .map((id) => ['district', id] as const),
      ...ids.improvement
        .filter((id) => e.improvement[id]!.civ === civ)
        .map((id) => ['improvement', id] as const),
    ].flatMap(([kind, id], i) => [...(i > 0 ? [', '] : []), ...link(kind, id)]);
  for (const id of ids.civ) {
    const c = e.civ[id]!;
    const leaders = ids.leader.filter((l) => e.leader[l]!.civ === id);
    out.push({
      id: `civ:${id}`,
      category: 'civs',
      title: t(c.name),
      subtitle: leaders.map((l) => name('leader', l)).join(', '),
      group: 'Civilizations',
      blocks: [
        ...(c.ability ? [facts([[t(c.ability.name), t(c.ability.description)]])] : []),
        facts([
          ['Leaders', leaders.flatMap((l, i) => [...(i > 0 ? [', '] : []), ...link('leader', l)])],
          ['Unique', uniquesOf(id)],
          ['Cities', c.cityNames.slice(0, 8).map(t).join(', ') + '…'],
        ]),
      ],
    });
  }
  for (const id of ids.leader) {
    const l = e.leader[id]!;
    out.push({
      id: `leader:${id}`,
      category: 'civs',
      title: t(l.name),
      subtitle: `${l.title ? t(l.title) : ''} · ${name('civ', l.civ)}`,
      group: 'Leaders',
      blocks: [
        ...(l.intro ? text(l.intro) : []),
        facts([
          ['Civilization', link('civ', l.civ)],
          ...(l.ability
            ? ([[t(l.ability.name), t(l.ability.description)]] as [string, string][])
            : []),
          ...(l.agenda
            ? ([[`Agenda: ${t(l.agenda.name)}`, t(l.agenda.description)]] as [string, string][])
            : []),
        ]),
        ...(l.quotes ? [{ kind: 'text' as const, text: `“${t(l.quotes.greeting)}”` }] : []),
      ],
    });
  }

  // Units.
  for (const id of ids.unit) {
    const u = e.unit[id]!;
    const cls = e.unitClass[u.class];
    out.push({
      id: `unit:${id}`,
      category: 'units',
      title: t(u.name),
      subtitle: cls ? t(cls.name) : undefined,
      group: cls ? t(cls.name) : 'Units',
      blocks: [
        facts([
          ['Strength', u.strength || undefined],
          [
            'Ranged strength',
            u.rangedStrength ? `${u.rangedStrength} (range ${u.range ?? 1})` : undefined,
          ],
          ['Movement', u.movement],
          [
            'Cost',
            u.faithCost > 0
              ? `${u.faithCost} faith`
              : u.cost > 0
                ? `${u.cost} production`
                : undefined,
          ],
          ['Upkeep', u.upkeep ? `${u.upkeep} gold` : undefined],
          ['Requires', requires(u)],
          ['Upgrades to', link('unit', u.upgradesTo)],
          ['Unique to', link('civ', u.civ)],
          ['Replaces', link('unit', u.replaces)],
          [
            'Nuclear',
            u.nuke ? `strikes ${u.nuke.range} tiles away, ${u.nuke.radius} wide` : undefined,
          ],
          [
            'Religious',
            u.religious
              ? `strength ${u.religious.strength}, ${u.religious.charges} charges${u.religious.removesHeresy ? ', removes heresy' : ''}${u.religious.heals ? `, heals ${u.religious.heals}` : ''}`
              : undefined,
          ],
        ]),
      ],
    });
  }

  // Buildings (worship buildings under Religion).
  for (const id of ids.building) {
    const b = e.building[id]!;
    out.push({
      id: `building:${id}`,
      category: b.worship ? 'religion' : 'buildings',
      title: t(b.name),
      subtitle: b.district ? `In the ${name('district', b.district)}` : undefined,
      group: b.worship
        ? 'Worship buildings'
        : b.district
          ? name('district', b.district)
          : 'In the city',
      blocks: [
        ...text(b.description),
        facts([
          ['Yields', yieldsText(b.yields)],
          ['Happiness', b.happiness ? `+${b.happiness}` : undefined],
          ['Cost', `${b.cost} production`],
          ['Maintenance', b.maintenance ? `${b.maintenance} gold` : undefined],
          ['District', link('district', b.district)],
          ['Needs', link('building', b.requiresBuilding)],
          ['Requires', requires(b)],
          ['Unique to', link('civ', b.civ)],
          ['Replaces', link('building', b.replaces)],
        ]),
      ],
    });
  }

  for (const id of ids.district) {
    const d = e.district[id]!;
    out.push({
      id: `district:${id}`,
      category: 'districts',
      title: t(d.name),
      blocks: [
        ...text(d.description),
        facts([
          ['Requires', requires(d)],
          ['Unique to', link('civ', d.civ)],
          ['Replaces', link('district', d.replaces)],
          [
            'Adjacency',
            (d.adjacency ?? [])
              .map(
                (a) =>
                  `+${a.amount} ${a.yield}${a.label ? ` (${a.label})` : ''}${a.every > 1 ? ` per ${a.every}` : ''}`,
              )
              .join('; '),
          ],
          [
            'Buildings',
            ids.building
              .filter((b) => e.building[b]!.district === id && !e.building[b]!.civ)
              .flatMap((b, i) => [...(i > 0 ? [', '] : []), ...link('building', b)]),
          ],
        ]),
      ],
    });
  }

  for (const id of ids.wonder) {
    const w = e.wonder[id]!;
    out.push({
      id: `wonder:${id}`,
      category: 'wonders',
      title: t(w.name),
      subtitle: eraName(w.era),
      group: eraName(w.era),
      blocks: [
        ...text(w.description),
        facts([
          ['Era', eraName(w.era)],
          ['Cost', `${w.cost} production`],
          ['Requires', requires(w)],
        ]),
      ],
    });
  }

  for (const id of ids.improvement) {
    const i = e.improvement[id]!;
    out.push({
      id: `improvement:${id}`,
      category: 'improvements',
      title: t(i.name),
      blocks: [
        facts([
          ['Yields', yieldsText(i.yields)],
          [
            'Adjacency',
            (i.adjacency ?? [])
              .map((a) => `+${a.amount} ${a.yield}${a.label ? ` (${a.label})` : ''}`)
              .join('; '),
          ],
          ['Requires', requires(i)],
          ['Unique to', link('civ', i.civ)],
        ]),
      ],
    });
  }

  // Techs and civics, with what they unlock.
  const unlocked = (key: 'requiresTech' | 'requiresCivic', id: string): Inline[] => {
    const kinds = [
      'unit',
      'building',
      'district',
      'wonder',
      'improvement',
      'project',
      'government',
      'policy',
    ] as const;
    const items: Inline[] = [];
    for (const kind of kinds) {
      for (const x of ids[kind]) {
        const d = (
          e[kind] as Record<string, { requiresTech?: string; requiresCivic?: string; civ?: string }>
        )[x]!;
        if (d[key] === id && !d.civ)
          items.push(...(items.length > 0 ? [', '] : []), ...link(kind, x));
      }
    }
    return items;
  };
  for (const kind of ['tech', 'civic'] as const) {
    for (const id of ids[kind]) {
      const n = e[kind][id]!;
      out.push({
        id: `${kind}:${id}`,
        category: kind === 'tech' ? 'techs' : 'civics',
        title: t(n.name),
        subtitle: eraName(n.era),
        group: eraName(n.era),
        blocks: [
          ...text(n.description),
          facts([
            ['Cost', `${n.cost} ${kind === 'tech' ? 'science' : 'culture'}`],
            ['Needs', n.requires.flatMap((r, i) => [...(i > 0 ? [', '] : []), ...link(kind, r)])],
            ['Boost', n.boost ? t(n.boost.text) : undefined],
            ['Unlocks', unlocked(kind === 'tech' ? 'requiresTech' : 'requiresCivic', id)],
          ]),
        ],
      });
    }
  }

  for (const id of ids.government) {
    const g = e.government[id]!;
    const slots = Object.entries(g.slots)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ');
    out.push({
      id: `government:${id}`,
      category: 'governments',
      title: t(g.name),
      group: 'Governments',
      blocks: [
        ...text(g.description),
        facts([
          ['Policy slots', slots],
          ['Requires', requires(g)],
        ]),
      ],
    });
  }
  for (const id of ids.policy) {
    const p = e.policy[id]!;
    out.push({
      id: `policy:${id}`,
      category: 'governments',
      title: t(p.name),
      subtitle: `${p.slot} policy`,
      group: `${p.slot[0]!.toUpperCase()}${p.slot.slice(1)} policies`,
      blocks: [
        ...text(p.description),
        facts([
          ['Requires', requires(p)],
          ['Replaced by', link('policy', p.obsoletedBy)],
        ]),
      ],
    });
  }

  for (const id of ids.belief) {
    const b = e.belief[id]!;
    out.push({
      id: `belief:${id}`,
      category: 'religion',
      title: t(b.name),
      subtitle: `${b.kind} belief`,
      group: `${b.kind[0]!.toUpperCase()}${b.kind.slice(1)} beliefs`,
      blocks: [...text(b.description), facts([['Builds', link('building', b.building)]])],
    });
  }

  for (const id of ids.greatPerson) {
    const g = e.greatPerson[id]!;
    out.push({
      id: `greatPerson:${id}`,
      category: 'greatPeople',
      title: t(g.name),
      subtitle: `${name('greatPersonClass', g.class)} · ${eraName(g.era)}`,
      group: name('greatPersonClass', g.class),
      blocks: text(g.description),
    });
  }

  for (const id of ids.cityState) {
    const c = e.cityState[id]!;
    const type = e.cityStateType[c.cityStateType];
    out.push({
      id: `cityState:${id}`,
      category: 'cityStates',
      title: t(c.name),
      subtitle: type ? t(type.name) : undefined,
      group: type ? t(type.name) : undefined,
      blocks: [facts([[`Suzerain: ${t(c.suzerain.name)}`, t(c.suzerain.description)]])],
    });
  }

  for (const id of ids.terrain) {
    const x = e.terrain[id]!;
    out.push({
      id: `terrain:${id}`,
      category: 'map',
      title: t(x.name),
      group: 'Terrain',
      blocks: [
        facts([
          ['Yields', yieldsText(x.yields)],
          ['Movement cost', x.water ? undefined : x.moveCost],
          ['Defense', x.defense || undefined],
        ]),
      ],
    });
  }
  for (const id of ids.feature) {
    const x = e.feature[id]!;
    out.push({
      id: `feature:${id}`,
      category: 'map',
      title: t(x.name),
      group: x.naturalWonder ? 'Natural wonders' : 'Features',
      blocks: [
        facts([
          ['Yields', yieldsText(x.yields)],
          ['Extra movement', x.moveCostExtra || undefined],
          ['Defense', x.defense || undefined],
          ['Impassable', x.impassable ? 'yes' : undefined],
        ]),
      ],
    });
  }
  for (const id of ids.resource) {
    const x = e.resource[id]!;
    out.push({
      id: `resource:${id}`,
      category: 'map',
      title: t(x.name),
      subtitle: `${x.class} resource`,
      group: `${x.class[0]!.toUpperCase()}${x.class.slice(1)} resources`,
      blocks: [
        facts([
          ['Yields', yieldsText(x.yields)],
          ['Happiness', x.happiness ? `+${x.happiness} nearby` : undefined],
        ]),
      ],
    });
  }

  for (const id of ids.promotion) {
    const p = e.promotion[id]!;
    out.push({
      id: `promotion:${id}`,
      category: 'promotions',
      title: t(p.name),
      subtitle: p.classes.map((c) => name('unitClass', c)).join(', '),
      group: name('unitClass', p.classes[0]),
      blocks: [
        ...text(p.description),
        facts([
          [
            'Needs',
            p.requires.flatMap((r, i) => [...(i > 0 ? [' or '] : []), ...link('promotion', r)]),
          ],
        ]),
      ],
    });
  }

  const world = (
    kind: 'governor' | 'age' | 'dedication' | 'disaster' | 'resolution' | 'spyMission' | 'project',
    group: string,
  ) => {
    for (const id of ids[kind]) {
      const x = (e[kind] as Record<string, { name: string; description?: string; title?: string }>)[
        id
      ]!;
      out.push({
        id: `${kind}:${id}`,
        category: 'world',
        title: t(x.name),
        subtitle: x.title ? t(x.title) : undefined,
        group,
        blocks: text(x.description),
      });
    }
  };
  world('governor', 'Governors');
  world('age', 'Ages');
  world('dedication', 'Dedications');
  world('project', 'Projects');
  world('spyMission', 'Spy missions');
  world('resolution', 'World Congress resolutions');
  world('disaster', 'Natural disasters');

  return out;
}

/** Articles matching a search, by title first, then by text. */
export function searchArticles(articles: Article[], query: string): Article[] {
  const q = query.trim().toLowerCase();
  if (!q) return articles;
  const inTitle = articles.filter((a) => a.title.toLowerCase().includes(q));
  const inText = articles.filter(
    (a) =>
      !inTitle.includes(a) &&
      a.blocks.some((b) =>
        b.kind === 'text'
          ? b.text.toLowerCase().includes(q)
          : b.kind === 'facts'
            ? b.rows.some(([k, v]) =>
                `${k} ${v.map((x) => (typeof x === 'string' ? x : x.text)).join('')}`
                  .toLowerCase()
                  .includes(q),
              )
            : false,
      ),
  );
  return [...inTitle, ...inText];
}
