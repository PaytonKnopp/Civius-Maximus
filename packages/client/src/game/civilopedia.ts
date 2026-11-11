import { type CompiledContent, resolveText } from '@cx/content';
import { upkeepOf } from '@cx/engine';
import { ICONS } from '../ui/icons';
import { CONCEPTS } from './concepts';
import { effectLines } from './effectText';

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

export interface Category {
  id: CategoryId;
  name: string;
  icon: string;
  /** One line on the Civilopedia's front page. */
  blurb: string;
  /** Articles inside a group: in the game's own order (progress), or by name. */
  sort: 'content' | 'name';
}

export const CATEGORIES: Category[] = [
  {
    id: 'concepts',
    name: 'How to play',
    icon: 'help',
    blurb: 'Turns, growth, happiness, war and every system explained.',
    sort: 'content',
  },
  {
    id: 'civs',
    name: 'Civilizations and leaders',
    icon: 'greatPeople',
    blurb: 'Who they are, what they do best and what is unique to them.',
    sort: 'name',
  },
  {
    id: 'units',
    name: 'Units',
    icon: 'warrior',
    blurb: 'Armies, ships, settlers and the units only some civs have.',
    sort: 'content',
  },
  {
    id: 'buildings',
    name: 'Buildings',
    icon: 'building',
    blurb: 'What to build in a city, district by district.',
    sort: 'content',
  },
  {
    id: 'districts',
    name: 'Districts',
    icon: 'district_campus',
    blurb: 'Specialized quarters and how their adjacency bonuses work.',
    sort: 'content',
  },
  {
    id: 'wonders',
    name: 'World wonders',
    icon: 'wonder',
    blurb: 'One of each in the world, by era.',
    sort: 'content',
  },
  {
    id: 'improvements',
    name: 'Improvements',
    icon: 'improvement_farm',
    blurb: 'Farms, mines and everything else you develop on the land.',
    sort: 'content',
  },
  {
    id: 'techs',
    name: 'Technologies',
    icon: 'research',
    blurb: 'The science tree, with what each one needs and unlocks.',
    sort: 'content',
  },
  {
    id: 'civics',
    name: 'Civics',
    icon: 'civic',
    blurb: 'The culture tree: governments, policies and more.',
    sort: 'content',
  },
  {
    id: 'governments',
    name: 'Governments and policies',
    icon: 'government',
    blurb: 'Every government, its slots, and every policy card.',
    sort: 'content',
  },
  {
    id: 'religion',
    name: 'Religion',
    icon: 'religion',
    blurb: 'Pantheons and beliefs, and the worship buildings they unlock.',
    sort: 'content',
  },
  {
    id: 'greatPeople',
    name: 'Great people',
    icon: 'gp_scientist',
    blurb: 'Scientists, generals, prophets and the other greats of history.',
    sort: 'content',
  },
  {
    id: 'cityStates',
    name: 'City-states',
    icon: 'cityStates',
    blurb: 'The minor powers, their kinds and what their suzerain gets.',
    sort: 'name',
  },
  {
    id: 'map',
    name: 'Terrain, features and resources',
    icon: 'lens',
    blurb: 'What every tile can hold, and what it yields.',
    sort: 'name',
  },
  {
    id: 'promotions',
    name: 'Promotions',
    icon: 'promote',
    blurb: 'How units grow stronger, by branch.',
    sort: 'content',
  },
  {
    id: 'world',
    name: 'Governors, eras and the world',
    icon: 'ages',
    blurb: 'Governors, ages, dedications, projects, spies, the Congress and disasters.',
    sort: 'content',
  },
];

/** A run of text with links to other articles. */
export type Inline = string | { link: string; text: string };

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'facts'; rows: [string, Inline[]][] }
  | { kind: 'links'; title: string; items: Inline[] }
  /** A bulleted list, each line with its own links (effects, abilities, quotes). */
  | { kind: 'list'; title: string; items: Inline[][] }
  /** A leader's portrait. */
  | { kind: 'portrait'; leader: string };

export interface Article {
  /** `kind:id`, e.g. `unit:unit_warrior` (concepts: `concept:growth`). */
  id: string;
  category: CategoryId;
  title: string;
  subtitle?: string | undefined;
  /** A short group label inside the category (an era, a class...). */
  group?: string | undefined;
  /** What kind of thing it is, for a chip and the search ("Unit", "Wonder"...). */
  kind: string;
  /** An icon name from the icon set, or a color for things that have no icon. */
  icon?: string | undefined;
  color?: string | undefined;
  blocks: Block[];
}

type Entities = CompiledContent['entities'];

/** Every article, in category order, then group, then the game's order (or by name). */
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
  const links = (kind: keyof Entities, list: readonly string[], sep = ', '): Inline[] =>
    list.flatMap((id, i) => [...(i > 0 ? [sep] : []), ...link(kind, id)]);
  const eraName = (id: string | undefined) => (id ? name('era', id) : '');
  const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
  const yieldsText = (y: Record<string, number> | undefined) =>
    Object.entries(y ?? {})
      .filter(([, n]) => n !== 0)
      .map(
        ([k, n]) => `${n > 0 ? '+' : ''}${n} ${e.yield[k] ? t(e.yield[k]!.name).toLowerCase() : k}`,
      )
      .join(', ');
  /** Great work slots by kind: `{ writing: 2, any: 1 }` → "2 writing, 1 of any kind". */
  const slotsText = (slots: Partial<Record<string, number>> | undefined) =>
    Object.entries(slots ?? {})
      .filter((e): e is [string, number] => (e[1] ?? 0) > 0)
      .map(([k, n]) => (k === 'any' ? `${n} of any kind` : `${n} ${k}`))
      .join(', ') || undefined;
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
  const effects = (
    title: string,
    list: Parameters<typeof effectLines>[1],
    local = false,
  ): Block[] => {
    const lines = effectLines(content, list, { local });
    return lines.length ? [{ kind: 'list', title, items: lines.map((l) => [l]) }] : [];
  };
  const push = (a: Omit<Article, 'kind'> & { kind: string }) => out.push(a);
  /** The icon for a thing, when the icon set has one. */
  const iconOf = (...names: (string | undefined)[]) => names.find((n) => n && ICONS[n]);

  // How to play.
  for (const c of CONCEPTS)
    push({
      id: `concept:${c.id}`,
      category: 'concepts',
      kind: 'Concept',
      icon: 'help',
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
    push({
      id: `civ:${id}`,
      category: 'civs',
      kind: 'Civilization',
      color: c.colors.primary,
      title: t(c.name),
      subtitle: leaders.map((l) => name('leader', l)).join(', '),
      group: 'Civilizations',
      blocks: [
        ...(c.ability
          ? [
              facts([[t(c.ability.name), t(c.ability.description)]]),
              ...effects('What it does', c.ability.effects),
            ]
          : []),
        facts([
          ['Leaders', links('leader', leaders)],
          ['Unique', uniquesOf(id)],
          ['Cities', c.cityNames.map(t).join(', ')],
        ]),
      ],
    });
  }
  const traitNames: Record<string, string> = {
    aggression: 'War',
    expansion: 'Expansion',
    science: 'Science',
    culture: 'Culture',
    wonders: 'Wonders',
    faith: 'Faith',
    gold: 'Gold',
    naval: 'Seas',
    diplomacy: 'Diplomacy',
    districts: 'Districts',
  };
  for (const id of ids.leader) {
    const l = e.leader[id]!;
    const personality = Object.entries((l.personality ?? {}) as Record<string, number>)
      .filter(([, v]) => v >= 6)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${traitNames[k] ?? k} ${v}/10`)
      .join(', ');
    push({
      id: `leader:${id}`,
      category: 'civs',
      kind: 'Leader',
      title: t(l.name),
      subtitle: `${l.title ? t(l.title) : ''} · ${name('civ', l.civ)}`,
      group: 'Leaders',
      blocks: [
        { kind: 'portrait', leader: id },
        ...(l.intro ? text(l.intro) : []),
        facts([
          ['Civilization', link('civ', l.civ)],
          ...(l.ability
            ? ([[t(l.ability.name), t(l.ability.description)]] as [string, string][])
            : []),
          ...(l.agenda
            ? ([[`Agenda: ${t(l.agenda.name)}`, t(l.agenda.description)]] as [string, string][])
            : []),
          ['Leans toward', personality],
        ]),
        ...effects('Leader ability', l.ability?.effects),
        ...(l.quotes
          ? [
              {
                kind: 'list' as const,
                title: 'In their words',
                items: (['greeting', 'war', 'peace', 'defeat'] as const)
                  .filter((k) => l.quotes?.[k])
                  .map((k) => [`${cap(k)}: “${t(l.quotes![k])}”`]),
              },
            ]
          : []),
      ],
    });
  }

  /** The era a thing becomes available in: its tech's or civic's era. */
  const unlockEra = (x: {
    requiresTech?: string | undefined;
    requiresCivic?: string | undefined;
  }) =>
    x.requiresTech
      ? e.tech[x.requiresTech]?.era
      : x.requiresCivic
        ? e.civic[x.requiresCivic]?.era
        : undefined;

  // Units.
  for (const id of ids.unit) {
    const u = e.unit[id]!;
    const cls = e.unitClass[u.class];
    const promos = ids.promotion.filter((p) => e.promotion[p]!.classes.includes(u.class));
    const era = unlockEra(u);
    const domain =
      cls?.domain === 'sea' ? 'at sea' : cls?.domain === 'air' ? 'in the air' : 'on land';
    const summary = [
      `${era ? `${cap(eraName(era))}-era` : 'A starting'} ${cls ? t(cls.name).toLowerCase() : ''} unit`,
      cls?.combat === false ? `that works ${domain}` : `that fights ${domain}`,
      u.civ
        ? `, unique to ${name('civ', u.civ)}${u.replaces ? ` in place of the ${name('unit', u.replaces)}` : ''}`
        : '',
    ].join(' ');
    push({
      id: `unit:${id}`,
      category: 'units',
      kind: 'Unit',
      icon: iconOf(u.model, u.icon),
      title: t(u.name),
      subtitle: cls ? t(cls.name) : undefined,
      group: cls ? t(cls.name) : 'Units',
      blocks: [
        { kind: 'text', text: `${summary.replace(/ ,/g, ',').replace(/\s+/g, ' ').trim()}.` },
        facts([
          ['Class', cls ? `${t(cls.name)} (${cls.domain})` : undefined],
          ['Era', link('era', era)],
          ['Strength', u.strength || undefined],
          [
            'Ranged strength',
            u.rangedStrength ? `${u.rangedStrength} (range ${u.range ?? 1})` : undefined,
          ],
          ['Movement', u.movement],
          ['Sight', u.sight],
          [
            'Cost',
            u.faithCost > 0
              ? `${u.faithCost} faith`
              : u.cost > 0
                ? `${u.cost} production`
                : undefined,
          ],
          ['Upkeep', u.upkeep ? `${upkeepOf({ content }, u.id)} gold a turn` : undefined],
          ['Uses a citizen', u.populationCost ? `${u.populationCost}` : undefined],
          ['Requires', requires(u)],
          ['Upgrades to', link('unit', u.upgradesTo)],
          [
            'Upgrades from',
            links(
              'unit',
              ids.unit.filter((x) => e.unit[x]!.upgradesTo === id),
            ),
          ],
          ['Unique to', link('civ', u.civ)],
          ['Replaces', link('unit', u.replaces)],
          [
            'Special',
            [
              u.commander ? 'commander: strengthens nearby units' : '',
              u.movesAfterAttack ? 'can move after attacking' : '',
              u.ignoresWounds ? 'fights at full strength when wounded' : '',
              u.ignoresTerrainCost ? 'ignores terrain movement costs' : '',
              u.deepWater ? 'can cross deep ocean' : '',
              u.killYields ? 'earns yields from kills' : '',
            ]
              .filter(Boolean)
              .join('; '),
          ],
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
          ['Promotions', promos.length > 0 ? links('promotion', promos.slice(0, 12)) : undefined],
        ]),
      ],
    });
  }

  // Buildings (worship buildings under Religion).
  for (const id of ids.building) {
    const b = e.building[id]!;
    push({
      id: `building:${id}`,
      category: b.worship ? 'religion' : 'buildings',
      kind: b.worship ? 'Worship building' : 'Building',
      icon: 'building',
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
          ['Era', link('era', unlockEra(b))],
          ['Yields', yieldsText(b.yields)],
          ['Happiness', b.happiness ? `+${b.happiness}` : undefined],
          ['Cost', `${b.cost} production`],
          ['Maintenance', b.maintenance ? `${b.maintenance} gold` : undefined],
          ['Great work slots', slotsText(b.slots)],
          ['District', link('district', b.district)],
          ['Needs', link('building', b.requiresBuilding)],
          ['Requires', requires(b)],
          [
            'Only',
            [b.cityOnly ? 'in cities' : '', b.requiresRiver ? 'next to a river' : '']
              .filter(Boolean)
              .join(', '),
          ],
          ['Unique to', link('civ', b.civ)],
          ['Replaces', link('building', b.replaces)],
        ]),
        ...effects('Effects', b.effects),
        ...effects('In this settlement', b.localEffects, true),
      ],
    });
  }

  for (const id of ids.district) {
    const d = e.district[id]!;
    push({
      id: `district:${id}`,
      category: 'districts',
      kind: 'District',
      icon: iconOf(d.icon, id) ?? 'district_campus',
      color: d.color,
      title: t(d.name),
      blocks: [
        ...text(d.description),
        facts([
          ['Cost', d.cost ? `${d.cost} production` : undefined],
          ['Yields', yieldsText(d.yields)],
          ['Happiness', d.happiness ? `+${d.happiness}` : undefined],
          ['Requires', requires(d)],
          ['Unique to', link('civ', d.civ)],
          ['Replaces', link('district', d.replaces)],
          ['Limit', d.onePerEmpire ? 'one in the whole empire' : undefined],
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
            links(
              'building',
              ids.building.filter((b) => e.building[b]!.district === id && !e.building[b]!.civ),
            ),
          ],
        ]),
        ...effects('Effects', d.effects),
        ...effects('In this settlement', d.localEffects, true),
      ],
    });
  }

  for (const id of ids.wonder) {
    const w = e.wonder[id]!;
    push({
      id: `wonder:${id}`,
      category: 'wonders',
      kind: 'Wonder',
      icon: 'wonder',
      title: t(w.name),
      subtitle: eraName(w.era),
      group: eraName(w.era),
      blocks: [
        ...text(w.description),
        facts([
          ['Era', link('era', w.era)],
          ['Cost', `${w.cost} production`],
          ['Yields', yieldsText(w.yields)],
          ['Great work slots', slotsText(w.slots)],
          ['Requires', requires(w)],
        ]),
        ...effects('Effects', w.effects),
      ],
    });
  }

  for (const id of ids.improvement) {
    const i = e.improvement[id]!;
    push({
      id: `improvement:${id}`,
      category: 'improvements',
      kind: 'Improvement',
      icon: iconOf(i.icon, id),
      color: i.color,
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
          ['Improves', i.resources ? links('resource', i.resources) : undefined],
          ['Defense', i.defense ? `+${i.defense}` : undefined],
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
      push({
        id: `${kind}:${id}`,
        category: kind === 'tech' ? 'techs' : 'civics',
        kind: kind === 'tech' ? 'Technology' : 'Civic',
        icon: kind === 'tech' ? 'research' : 'civic',
        title: t(n.name),
        subtitle: eraName(n.era),
        group: eraName(n.era),
        blocks: [
          ...text(n.description),
          facts([
            ['Era', link('era', n.era)],
            ['Cost', `${n.cost} ${kind === 'tech' ? 'science' : 'culture'}`],
            ['Needs', links(kind, n.requires)],
            [
              'Leads to',
              links(
                kind,
                ids[kind].filter((x) => e[kind][x]!.requires.includes(id)),
              ),
            ],
            ['Boost', n.boost ? t(n.boost.text) : undefined],
            ['Unlocks', unlocked(kind === 'tech' ? 'requiresTech' : 'requiresCivic', id)],
          ]),
          ...effects('Effects', n.effects),
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
    push({
      id: `government:${id}`,
      category: 'governments',
      kind: 'Government',
      icon: 'government',
      title: t(g.name),
      group: 'Governments',
      blocks: [
        ...text(g.description),
        facts([
          ['Policy slots', slots],
          ['Requires', requires(g)],
        ]),
        ...effects('Effects', g.effects),
      ],
    });
  }
  for (const id of ids.policy) {
    const p = e.policy[id]!;
    push({
      id: `policy:${id}`,
      category: 'governments',
      kind: 'Policy',
      icon: 'civic',
      title: t(p.name),
      subtitle: `${p.slot} policy`,
      group: `${cap(p.slot)} policies`,
      blocks: [
        ...text(p.description),
        facts([
          ['Requires', requires(p)],
          ['Obsolete with', link('civic', p.obsoletedBy)],
        ]),
        ...effects('Effects', p.effects),
      ],
    });
  }

  for (const id of ids.belief) {
    const b = e.belief[id]!;
    push({
      id: `belief:${id}`,
      category: 'religion',
      kind: 'Belief',
      icon: 'religion',
      title: t(b.name),
      subtitle: `${b.kind} belief`,
      group: `${cap(b.kind)} beliefs`,
      blocks: [
        ...text(b.description),
        facts([['Builds', link('building', b.building)]]),
        ...effects('Effects', b.effects),
      ],
    });
  }

  for (const id of ids.greatPerson) {
    const g = e.greatPerson[id]!;
    push({
      id: `greatPerson:${id}`,
      category: 'greatPeople',
      kind: 'Great person',
      icon: iconOf(g.class),
      title: t(g.name),
      subtitle: `${name('greatPersonClass', g.class)} · ${eraName(g.era)}`,
      group: name('greatPersonClass', g.class),
      blocks: [
        ...text(g.description),
        facts([
          ['Class', link('greatPersonClass', g.class)],
          ['Era', link('era', g.era)],
        ]),
        ...effects('Lasting effects', g.effects),
      ],
    });
  }

  for (const id of ids.cityState) {
    const c = e.cityState[id]!;
    const type = e.cityStateType[c.cityStateType];
    push({
      id: `cityState:${id}`,
      category: 'cityStates',
      kind: 'City-state',
      icon: 'cityStates',
      color: type?.color,
      title: t(c.name),
      subtitle: type ? t(type.name) : undefined,
      group: type ? t(type.name) : undefined,
      blocks: [
        facts([
          ['Kind', link('cityStateType', c.cityStateType)],
          [`Suzerain: ${t(c.suzerain.name)}`, t(c.suzerain.description)],
        ]),
        ...effects('Suzerain bonus', c.suzerain.effects),
      ],
    });
  }

  // Kinds of things: unit classes, great people and city-states, each listing its members.
  for (const id of ids.unitClass) {
    const c = e.unitClass[id]!;
    const members = ids.unit.filter((u) => e.unit[u]!.class === id);
    push({
      id: `unitClass:${id}`,
      category: 'units',
      kind: 'Unit class',
      icon: iconOf(members.map((u) => e.unit[u]!.model).find((m) => ICONS[m])),
      title: t(c.name),
      subtitle: `${members.length} unit${members.length === 1 ? '' : 's'}`,
      group: 'Unit classes',
      blocks: [
        facts([
          [
            'Fights',
            c.combat === false
              ? 'no: a civilian'
              : `on ${c.domain === 'land' ? 'land' : c.domain === 'sea' ? 'the sea' : c.domain}`,
          ],
          ['Units', links('unit', members)],
          [
            'Promotions',
            links(
              'promotion',
              ids.promotion.filter((p) => e.promotion[p]!.classes.includes(id)),
            ),
          ],
        ]),
      ],
    });
  }
  for (const id of ids.greatPersonClass) {
    const c = e.greatPersonClass[id]!;
    const members = ids.greatPerson.filter((g) => e.greatPerson[g]!.class === id);
    push({
      id: `greatPersonClass:${id}`,
      category: 'greatPeople',
      kind: 'Kind of great person',
      icon: iconOf(id),
      title: t(c.name),
      subtitle: `${members.length} in the game`,
      group: 'Kinds of great people',
      blocks: [
        facts([
          ['First one costs', c.baseCost ? `${c.baseCost} points` : undefined],
          ['Each after', c.costStep ? `+${c.costStep} points` : undefined],
          ['In order', links('greatPerson', members)],
        ]),
      ],
    });
  }
  for (const id of ids.cityStateType) {
    const c = e.cityStateType[id]!;
    const members = ids.cityState.filter((x) => e.cityState[x]!.cityStateType === id);
    push({
      id: `cityStateType:${id}`,
      category: 'cityStates',
      kind: 'Kind of city-state',
      icon: 'cityStates',
      color: c.color,
      title: t(c.name),
      subtitle: `${members.length} city-states`,
      group: 'Kinds',
      blocks: [
        facts([
          ['District', link('district', c.district)],
          ['City-states', links('cityState', members)],
        ]),
        ...(c.tiers?.length
          ? [
              {
                kind: 'list' as const,
                title: 'Envoy bonuses',
                items: c.tiers.map((tier) => [
                  `${tier.envoys} envoy${tier.envoys === 1 ? '' : 's'}: ${tier.description ? t(tier.description) : effectLines(content, tier.effects).join('; ')}`,
                ]),
              },
            ]
          : []),
      ],
    });
  }

  for (const id of ids.terrain) {
    const x = e.terrain[id]!;
    push({
      id: `terrain:${id}`,
      category: 'map',
      kind: 'Terrain',
      color: x.color,
      title: t(x.name),
      group: 'Terrain',
      blocks: [
        facts([
          ['Yields', yieldsText(x.yields)],
          ['Movement cost', x.water ? undefined : x.moveCost],
          ['Defense', x.defense || undefined],
          ['Can be', x.elevations?.join(', ')],
          [
            'Features',
            links(
              'feature',
              ids.feature.filter((f) => e.feature[f]!.validTerrains?.includes(id)),
            ),
          ],
          [
            'Resources',
            links(
              'resource',
              ids.resource.filter((r) => e.resource[r]!.validTerrains?.includes(id)),
            ),
          ],
          ['Water', x.water ? (x.deepWater ? 'deep ocean' : 'shallow water') : undefined],
        ]),
      ],
    });
  }
  for (const id of ids.feature) {
    const x = e.feature[id]!;
    push({
      id: `feature:${id}`,
      category: 'map',
      kind: x.naturalWonder ? 'Natural wonder' : 'Feature',
      color: x.color,
      title: t(x.name),
      group: x.naturalWonder ? 'Natural wonders' : 'Features',
      blocks: [
        facts([
          ['Yields', yieldsText(x.yields)],
          ['Extra movement', x.moveCostExtra || undefined],
          ['Defense', x.defense || undefined],
          ['Impassable', x.impassable ? 'yes' : undefined],
          ['Found on', x.validTerrains ? links('terrain', x.validTerrains) : undefined],
          ['Can be cleared', x.removable ? 'yes' : undefined],
          ['Blocks sight', x.blocksSight ? 'yes' : undefined],
          ['Needs', x.requiresRiver ? 'a river' : undefined],
        ]),
      ],
    });
  }
  for (const id of ids.resource) {
    const x = e.resource[id]!;
    push({
      id: `resource:${id}`,
      category: 'map',
      kind: 'Resource',
      icon: iconOf(id),
      title: t(x.name),
      subtitle: `${x.class} resource`,
      group: `${cap(x.class)} resources`,
      blocks: [
        facts([
          ['Yields', yieldsText(x.yields)],
          ['Happiness', x.happiness ? `+${x.happiness} nearby` : undefined],
          ['Found on', x.validTerrains ? links('terrain', x.validTerrains) : undefined],
          ['Or on', x.validFeatures ? links('feature', x.validFeatures) : undefined],
          ['Needs a', x.validElevations ? x.validElevations.join(' or ') : undefined],
          [
            'Improved by',
            links(
              'improvement',
              ids.improvement.filter((i) => e.improvement[i]!.resources?.includes(id)),
            ),
          ],
          [
            'Stockpile',
            x.stockpilePerTurn ? `+${x.stockpilePerTurn} per turn when improved` : undefined,
          ],
          [
            'Monopoly',
            x.monopoly.length > 0
              ? `More than ${content.rules.monopoly.sharePercent}% of the map's ${t(x.name)}, improved in your land (at least ${content.rules.monopoly.minCopies}): ${effectLines(content, x.monopoly).join('; ')}`
              : undefined,
          ],
        ]),
      ],
    });
  }

  for (const id of ids.promotion) {
    const p = e.promotion[id]!;
    push({
      id: `promotion:${id}`,
      category: 'promotions',
      kind: 'Promotion',
      icon: 'promote',
      title: t(p.name),
      subtitle: p.classes.map((c) => name('unitClass', c)).join(', '),
      group: name('unitClass', p.classes[0]),
      blocks: [
        ...text(p.description),
        facts([
          ['Tier', `${p.tier}`],
          ['Units', links('unitClass', p.classes)],
          ['Needs', links('promotion', p.requires, ' or ')],
          [
            'Leads to',
            links(
              'promotion',
              ids.promotion.filter((x) => e.promotion[x]!.requires.includes(id)),
            ),
          ],
        ]),
      ],
    });
  }

  const world = (
    kind:
      | 'governor'
      | 'age'
      | 'dedication'
      | 'disaster'
      | 'resolution'
      | 'spyMission'
      | 'project'
      | 'specialization',
    group: string,
    label: string,
  ) => {
    for (const id of ids[kind]) {
      const x = (
        e[kind] as Record<
          string,
          { name: string; description?: string; title?: string; icon?: string; effects?: never[] }
        >
      )[id]!;
      push({
        id: `${kind}:${id}`,
        category: 'world',
        kind: label,
        icon: iconOf(x.icon),
        title: t(x.name),
        subtitle: x.title ? t(x.title) : undefined,
        group,
        blocks: [
          ...text(x.description),
          // A governor and a town's specialization work in the one settlement they are in.
          ...(kind === 'governor' || kind === 'specialization'
            ? effects('In its settlement', x.effects, true)
            : effects('Effects', x.effects)),
        ],
      });
    }
  };
  world('governor', 'Governors', 'Governor');
  world('age', 'Ages', 'Age');
  world('dedication', 'Dedications', 'Dedication');
  world('project', 'Projects', 'Project');
  world('specialization', 'Town specializations', 'Specialization');
  world('spyMission', 'Spy missions', 'Spy mission');
  world('resolution', 'World Congress resolutions', 'Resolution');
  world('disaster', 'Natural disasters', 'Disaster');
  // Eras.
  for (const id of ids.era) {
    const x = e.era[id]!;
    push({
      id: `era:${id}`,
      category: 'world',
      kind: 'Era',
      icon: 'ages',
      title: t(x.name),
      subtitle: `Era ${x.order}`,
      group: 'Eras',
      blocks: [
        facts([
          [
            'Technologies',
            links(
              'tech',
              ids.tech.filter((tc) => e.tech[tc]!.era === id),
            ),
          ],
          [
            'Civics',
            links(
              'civic',
              ids.civic.filter((c) => e.civic[c]!.era === id),
            ),
          ],
          [
            'Wonders',
            links(
              'wonder',
              ids.wonder.filter((w) => e.wonder[w]!.era === id),
            ),
          ],
          [
            'Starting here gives',
            x.start
              ? [
                  x.start.gold ? `${x.start.gold} gold` : '',
                  x.start.units?.length
                    ? x.start.units.map((u: string) => name('unit', u)).join(', ')
                    : '',
                ]
                  .filter(Boolean)
                  .join(' and ')
              : undefined,
          ],
        ]),
      ],
    });
  }
  // Mods can add kinds of governors, ages... that have no entities here: nothing to do.

  return arrange(out);
}

/** Sorted into categories, then groups in the order they first appear, then (maybe) by name. */
function arrange(articles: Article[]): Article[] {
  const out: Article[] = [];
  for (const cat of CATEGORIES) {
    const inCat = articles.filter((a) => a.category === cat.id);
    const groups: string[] = [];
    for (const a of inCat) if (!groups.includes(a.group ?? '')) groups.push(a.group ?? '');
    for (const g of groups) {
      const items = inCat.filter((a) => (a.group ?? '') === g);
      if (cat.sort === 'name') items.sort((a, b) => a.title.localeCompare(b.title));
      out.push(...items);
    }
  }
  return out;
}

/** Which articles link to which: for "Mentioned in" on every article. */
export function backlinks(articles: Article[]): Map<string, string[]> {
  const ids = new Set(articles.map((a) => a.id));
  const map = new Map<string, Set<string>>();
  const add = (to: string, from: string) => {
    if (to === from || !ids.has(to)) return;
    let s = map.get(to);
    if (!s) map.set(to, (s = new Set()));
    s.add(from);
  };
  for (const a of articles)
    for (const b of a.blocks) {
      const inl: Inline[] =
        b.kind === 'facts'
          ? b.rows.flatMap(([, v]) => v)
          : b.kind === 'links'
            ? b.items
            : b.kind === 'list'
              ? b.items.flat()
              : [];
      for (const x of inl) if (typeof x !== 'string') add(x.link, a.id);
    }
  return new Map([...map].map(([k, v]) => [k, [...v]]));
}

/** The links an article makes, in reading order, without repeats. */
export function outgoing(article: Article): string[] {
  const seen = new Set<string>();
  for (const b of article.blocks) {
    const inl: Inline[] =
      b.kind === 'facts'
        ? b.rows.flatMap(([, v]) => v)
        : b.kind === 'links'
          ? b.items
          : b.kind === 'list'
            ? b.items.flat()
            : [];
    for (const x of inl) if (typeof x !== 'string') seen.add(x.link);
  }
  return [...seen];
}

/** The plain text of an article, for searching. */
export function plainText(article: Article): string {
  const inl = (xs: Inline[]) => xs.map((x) => (typeof x === 'string' ? x : x.text)).join('');
  return article.blocks
    .map((b) =>
      b.kind === 'text'
        ? b.text
        : b.kind === 'facts'
          ? b.rows.map(([k, v]) => `${k} ${inl(v)}`).join(' ')
          : b.kind === 'links'
            ? `${b.title} ${inl(b.items)}`
            : b.kind === 'list'
              ? `${b.title} ${b.items.map(inl).join(' ')}`
              : '',
    )
    .join(' ');
}

export interface SearchHit {
  article: Article;
  /** A line of text around the match, when it wasn't the title. */
  snippet?: string;
}

/**
 * Articles matching a search, best first: the title (exact, then starting with it, then a word
 * in it, then anywhere in it), then the kind and subtitle, then the text. Every word must match
 * somewhere, so "iron sword" finds things that mention both.
 */
export function searchArticles(
  articles: Article[],
  query: string,
  text: Map<string, string>,
): SearchHit[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return articles.map((article) => ({ article }));
  const q = words.join(' ');
  const hits: { hit: SearchHit; score: number }[] = [];
  for (const a of articles) {
    const title = a.title.toLowerCase();
    const meta = `${a.kind} ${a.subtitle ?? ''} ${a.group ?? ''}`.toLowerCase();
    const body = (text.get(a.id) ?? '').toLowerCase();
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (title.includes(w))
        score +=
          title === w ? 100 : title.startsWith(w) ? 60 : title.split(/\W+/).includes(w) ? 40 : 25;
      else if (meta.includes(w)) score += 10;
      else if (body.includes(w)) score += 3;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (title === q) score += 50;
    let snippet: string | undefined;
    if (!words.every((w) => title.includes(w))) {
      const i = body.indexOf(words.find((w) => !title.includes(w)) ?? words[0]!);
      if (i >= 0) {
        const raw = (text.get(a.id) ?? '').slice(Math.max(0, i - 40), i + 90).trim();
        snippet = `${i > 40 ? '…' : ''}${raw}…`;
      }
    }
    hits.push({ hit: snippet ? { article: a, snippet } : { article: a }, score });
  }
  return hits.sort((x, y) => y.score - x.score).map((h) => h.hit);
}
