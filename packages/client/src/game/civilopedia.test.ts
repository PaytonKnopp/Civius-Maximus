import { compileFromDirs } from '@cx/content/node';
import { describe, expect, it } from 'vitest';
import {
  backlinks,
  buildArticles,
  CATEGORIES,
  outgoing,
  plainText,
  searchArticles,
} from './civilopedia';
import { effectLines } from './effectText';

const content = compileFromDirs().content!;
const articles = buildArticles(content);
const byId = new Map(articles.map((a) => [a.id, a]));
const texts = new Map(articles.map((a) => [a.id, plainText(a)]));

describe('Civilopedia', () => {
  it('has one article per thing, in a known category, each with a title and something to read', () => {
    expect(byId.size).toBe(articles.length);
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const a of articles) {
      expect(cats.has(a.category), a.id).toBe(true);
      expect(a.title.trim(), a.id).not.toBe('');
      expect(a.blocks.length, a.id).toBeGreaterThan(0);
    }
    for (const c of CATEGORIES)
      expect(
        articles.some((a) => a.category === c.id),
        c.id,
      ).toBe(true);
  });

  it('never shows a raw value instead of words', () => {
    const bad = articles.filter((a) =>
      /\[object Object\]|\bundefined\b|\bNaN\b/.test(texts.get(a.id)!),
    );
    expect(bad.map((a) => `${a.id}: ${texts.get(a.id)!.slice(0, 120)}`)).toEqual([]);
  });

  it('only links to articles that exist', () => {
    const broken = articles.flatMap((a) =>
      outgoing(a)
        .filter((l) => !byId.has(l))
        .map((l) => `${a.id} -> ${l}`),
    );
    expect(broken).toEqual([]);
  });

  it('knows what links back to an article', () => {
    // Rome's unique unit says it is unique to Rome.
    expect(backlinks(articles).get('civ:civ_rome')).toContain('unit:unit_legionary');
  });

  it('ranks a title match first and needs every word to match', () => {
    expect(searchArticles(articles, 'legion', texts)[0]!.article.id).toBe('unit:unit_legionary');
    expect(searchArticles(articles, 'Library', texts)[0]!.article.title).toBe('Library');
    const both = searchArticles(articles, 'rome legionary', texts).map((h) => h.article.id);
    expect(both).toContain('civ:civ_rome');
    expect(searchArticles(articles, 'zzzqqq', texts)).toEqual([]);
  });

  it('describes units in a sentence and effects in plain words', () => {
    const legion = byId.get('unit:unit_legionary')!;
    const first = legion.blocks[0]!;
    expect(first.kind === 'text' && first.text).toMatch(/unit that fights on land, unique to Rome/);
    expect(
      effectLines(content, [
        {
          effect: 'modify_yield',
          params: { yield: 'science', percent: 10 },
          target: { scope: 'settlements' },
        },
      ]),
    ).toEqual(['+10% science in every settlement']);
    // Nested conditions read as words, not raw values.
    expect(texts.get('civ:civ_aztec')).toContain(
      '+1 food on Farms beside a river or next to a Lake tile',
    );
    expect(texts.get('leader:leader_hannibal')).toContain('+5 strength for every unit on Hills');
    // What sits in one settlement doesn't claim every settlement.
    expect(
      effectLines(
        content,
        [
          {
            effect: 'modify_growth',
            params: { percent: 15 },
            target: { scope: 'settlements' },
            condition: { settlement_on_river: true },
          },
        ],
        { local: true },
      ),
    ).toEqual(['+15% growth in a settlement on a river']);
  });

  it('writes every effect in the base game as words', () => {
    // Every list of effects anywhere in the content (abilities, buildings, policies, beliefs,
    // legacies, tiers, monopolies, resolutions...), read as the player would read it.
    const lines = new Map<string, string>();
    const visit = (owner: string, v: unknown) => {
      if (Array.isArray(v)) {
        if (
          v.length > 0 &&
          v.every((x) => x && typeof x === 'object' && typeof x.effect === 'string')
        ) {
          for (const local of [false, true])
            for (const line of effectLines(content, v, { local })) lines.set(line, owner);
        } else v.forEach((x) => visit(owner, x));
      } else if (v && typeof v === 'object') Object.values(v).forEach((x) => visit(owner, x));
    };
    for (const group of Object.values(content.entities))
      for (const [id, def] of Object.entries(group)) visit(id, def);
    visit('rules', content.rules);
    expect(lines.size).toBeGreaterThan(300);
    const bad = [...lines].filter(
      ([line]) =>
        // Raw data, ids, empty slots in a sentence, doubled spaces, a dangling colon or comma.
        /[{}[\]"_]|undefined|NaN|null|true|false| {2}|toward (?:in|$)|: *$|, *$|^\s|\s$/.test(
          line,
        ) ||
        // A sentence starts with a capital, a sign or a number.
        !/^[A-Z+−0-9]/.test(line),
    );
    expect(bad.map(([line, owner]) => `${owner}: ${line}`)).toEqual([]);
  });
});
