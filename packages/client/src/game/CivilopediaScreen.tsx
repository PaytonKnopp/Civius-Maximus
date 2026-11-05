import type { CompiledContent } from '@cx/content';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Emblem } from '../ui/Emblem';
import { Icon } from '../ui/Icon';
import { LeaderCard, LeaderHead } from '../ui/LeaderCard';
import { MenuScreen } from '../ui/Menu';
import {
  type Article,
  backlinks,
  buildArticles,
  CATEGORIES,
  type CategoryId,
  type Inline,
  plainText,
  searchArticles,
} from './civilopedia';

/**
 * The Civilopedia (docs/06-ui-ux.md, "Civilopedia"): a front page of categories, a tree to browse
 * (category, group, article), a search that ranks and filters, and articles with every link
 * clickable, what links back to them, Back and Forward, and the articles you read last.
 * Used from the title screen and from inside a game.
 */

const RECENT_KEY = 'cx.pedia.recent';
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const writeRecent = (ids: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 10)));
  } catch {
    // Not remembered.
  }
};

export function CivilopediaScreen({
  content,
  initial,
  onClose,
}: {
  content: CompiledContent;
  /** An article to open on (`unit:unit_warrior`...). */
  initial?: string | undefined;
  onClose: () => void;
}) {
  const articles = useMemo(() => buildArticles(content), [content]);
  const byId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);
  const texts = useMemo(() => new Map(articles.map((a) => [a.id, plainText(a)])), [articles]);
  const back = useMemo(() => backlinks(articles), [articles]);
  const counts = useMemo(() => {
    const m = new Map<CategoryId, number>();
    for (const a of articles) m.set(a.category, (m.get(a.category) ?? 0) + 1);
    return m;
  }, [articles]);

  // Where you are: a history of article ids (null: the front page).
  const [history, setHistory] = useState<{ stack: (string | null)[]; at: number }>(() => ({
    stack: [initial && byId.has(initial) ? initial : null],
    at: 0,
  }));
  const current = history.stack[history.at] ?? null;
  const article = current ? (byId.get(current) ?? null) : null;
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<CategoryId | 'all'>('all');
  const [drawer, setDrawer] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => {
    const a = initial ? byId.get(initial) : undefined;
    return new Set(a ? [a.category, `${a.category}|${a.group ?? ''}`] : []);
  });
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [showAllBack, setShowAllBack] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const activeRow = useRef<HTMLButtonElement>(null);

  const reveal = useCallback((a: Article) => {
    setOpen((o) => new Set([...o, a.category, `${a.category}|${a.group ?? ''}`]));
  }, []);
  const visit = (id: string | null) => {
    const a = id ? byId.get(id) : undefined;
    if (id && !a) return;
    if (id === current) return;
    setHistory((h) => ({ stack: [...h.stack.slice(0, h.at + 1), id], at: h.at + 1 }));
    setShowAllBack(false);
    setDrawer(false);
    if (a) {
      reveal(a);
      setRecent((r) => {
        const next = [a.id, ...r.filter((x) => x !== a.id)].slice(0, 10);
        writeRecent(next);
        return next;
      });
    }
  };
  const step = (d: -1 | 1) =>
    setHistory((h) => {
      const at = h.at + d;
      if (at < 0 || at >= h.stack.length) return h;
      const a = h.stack[at] ? byId.get(h.stack[at]!) : undefined;
      if (a) reveal(a);
      return { ...h, at };
    });
  // The first article opened counts as read.
  useEffect(() => {
    if (initial && byId.has(initial))
      setRecent((r) => {
        const next = [initial, ...r.filter((x) => x !== initial)].slice(0, 10);
        writeRecent(next);
        return next;
      });
  }, [initial, byId]);

  useEffect(() => {
    articleRef.current?.scrollTo?.(0, 0);
  }, [current]);
  useEffect(() => {
    activeRow.current?.scrollIntoView?.({ block: 'nearest' });
  }, [current, drawer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        setDrawer(true);
        setTimeout(() => search.current?.focus(), 0);
      } else if (e.altKey && e.key === 'ArrowLeft') step(-1);
      else if (e.altKey && e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const q = query.trim();
  const results = useMemo(
    () => (q ? searchArticles(articles, q, texts) : []),
    [articles, q, texts],
  );
  const resultCounts = useMemo(() => {
    const m = new Map<CategoryId, number>();
    for (const r of results) m.set(r.article.category, (m.get(r.article.category) ?? 0) + 1);
    return m;
  }, [results]);
  const shown = scope === 'all' ? results : results.filter((r) => r.article.category === scope);

  const toggle = (key: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const inline = (parts: Inline[]) =>
    parts.map((p, i) =>
      typeof p === 'string' ? (
        <span key={i}>{p}</span>
      ) : (
        <button key={i} type="button" className="pedia-link" onClick={() => visit(p.link)}>
          {p.text}
        </button>
      ),
    );

  const catName = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.name ?? '';
  const siblings = article
    ? articles.filter(
        (a) => a.category === article.category && (a.group ?? '') === (article.group ?? ''),
      )
    : [];
  const at = article ? siblings.findIndex((a) => a.id === article.id) : -1;
  const mentioned = article ? (back.get(article.id) ?? []) : [];
  const group = (ids: string[]) => {
    const by = new Map<CategoryId, Article[]>();
    for (const id of ids) {
      const a = byId.get(id);
      if (a) by.set(a.category, [...(by.get(a.category) ?? []), a]);
    }
    return [...by];
  };

  // --- Sidebar --------------------------------------------------------------------------------

  const tree = (
    <div className="pedia-tree">
      {CATEGORIES.map((c) => {
        const inCat = articles.filter((a) => a.category === c.id);
        const groups = [...new Set(inCat.map((a) => a.group ?? ''))];
        const flat = groups.length <= 1;
        const catOpen = open.has(c.id);
        return (
          <section key={c.id} className={`pedia-cat ${catOpen ? 'open' : ''}`}>
            <button
              type="button"
              className="pedia-cat-head"
              aria-expanded={catOpen}
              onClick={() => toggle(c.id)}
            >
              <Icon name={c.icon} size={20} />
              <span>{c.name}</span>
              <small>{counts.get(c.id) ?? 0}</small>
              <i aria-hidden="true">{catOpen ? '▾' : '▸'}</i>
            </button>
            {catOpen && (
              <div className="pedia-cat-body">
                {flat
                  ? inCat.map((a) => row(a))
                  : groups.map((g) => {
                      const key = `${c.id}|${g}`;
                      const gOpen = open.has(key);
                      const items = inCat.filter((a) => (a.group ?? '') === g);
                      return (
                        <div key={key} className="pedia-group">
                          <button
                            type="button"
                            className="pedia-group-head"
                            aria-expanded={gOpen}
                            onClick={() => toggle(key)}
                          >
                            <i aria-hidden="true">{gOpen ? '▾' : '▸'}</i>
                            <span>{g || 'Other'}</span>
                            <small>{items.length}</small>
                          </button>
                          {gOpen && items.map((a) => row(a))}
                        </div>
                      );
                    })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );

  function row(a: Article, snippet?: string) {
    return (
      <button
        key={a.id}
        type="button"
        ref={a.id === current ? activeRow : undefined}
        className={`pedia-row ${a.id === current ? 'on' : ''}`}
        onClick={() => visit(a.id)}
      >
        <span className="pedia-row-icon">
          <ArticleIcon article={a} size={20} content={content} />
        </span>
        <span className="pedia-row-text">
          <strong>{a.title}</strong>
          <small>{snippet ?? a.subtitle ?? a.kind}</small>
        </span>
      </button>
    );
  }

  const sidebar = (
    <aside className={`pedia-side ${drawer ? 'open' : ''}`} aria-label="Browse">
      <div className="pedia-search">
        <input
          ref={search}
          type="search"
          placeholder="Search everything  ( / )"
          aria-label="Search the Civilopedia"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.preventDefault();
              setQuery('');
            } else if (e.key === 'Enter' && shown[0]) {
              visit(shown[0].article.id);
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="ghost"
            aria-label="Clear search"
            onClick={() => setQuery('')}
          >
            ✕
          </button>
        )}
      </div>
      {q ? (
        <>
          <div className="pedia-filters" role="group" aria-label="Narrow the results">
            <button
              type="button"
              className={scope === 'all' ? 'on' : ''}
              aria-pressed={scope === 'all'}
              onClick={() => setScope('all')}
            >
              All <small>{results.length}</small>
            </button>
            {CATEGORIES.filter((c) => resultCounts.get(c.id)).map((c) => (
              <button
                key={c.id}
                type="button"
                className={scope === c.id ? 'on' : ''}
                aria-pressed={scope === c.id}
                onClick={() => setScope(c.id)}
              >
                {c.name.replace(/ and .*/, '')} <small>{resultCounts.get(c.id)}</small>
              </button>
            ))}
          </div>
          <div className="pedia-results" aria-label="Search results">
            {shown.length === 0 && <p className="mx-empty">Nothing matches “{q}”.</p>}
            {shown
              .slice(0, 120)
              .map((r) => row(r.article, r.snippet ?? r.article.subtitle ?? r.article.kind))}
            {shown.length > 120 && <p className="hint">Showing the best 120. Narrow the search.</p>}
          </div>
        </>
      ) : (
        <>
          <div className="pedia-side-tools">
            <button type="button" className="ghost small" onClick={() => visit(null)}>
              Front page
            </button>
            <button
              type="button"
              className="ghost small"
              onClick={() => setOpen(new Set(open.size ? [] : CATEGORIES.map((c) => c.id)))}
            >
              {open.size ? 'Collapse all' : 'Open all'}
            </button>
            <button
              type="button"
              className="ghost small"
              onClick={() => visit(articles[Math.floor(Math.random() * articles.length)]!.id)}
            >
              Random
            </button>
          </div>
          {tree}
        </>
      )}
    </aside>
  );

  // --- Main -----------------------------------------------------------------------------------

  const front = (
    <div className="pedia-front">
      <h3>Everything in the game, in one place</h3>
      <p>
        Browse by category on the left, or search for anything: a unit, a leader, a rule. Every name
        in an article is a link, and each article lists what links back to it.
      </p>
      {recent.length > 0 && (
        <section>
          <h4>Read lately</h4>
          <div className="pedia-chips">
            {recent
              .map((id) => byId.get(id))
              .filter((a): a is Article => !!a)
              .map((a) => (
                <button key={a.id} type="button" className="pedia-chip" onClick={() => visit(a.id)}>
                  <ArticleIcon article={a} size={16} content={content} /> {a.title}
                </button>
              ))}
          </div>
        </section>
      )}
      <section>
        <h4>Browse</h4>
        <div className="pedia-tiles">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="pedia-tile"
              onClick={() => {
                // Open the shelf, not an article: the tree shows what is inside.
                setOpen(new Set([c.id]));
                setDrawer(true);
              }}
            >
              <Icon name={c.icon} size={30} />
              <span>
                <strong>{c.name}</strong>
                <small>{c.blurb}</small>
              </span>
              <b>{counts.get(c.id) ?? 0}</b>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h4>New to the game? Start here</h4>
        <div className="pedia-chips">
          {articles
            .filter((a) => a.category === 'concepts')
            .slice(0, 8)
            .map((a) => (
              <button key={a.id} type="button" className="pedia-chip" onClick={() => visit(a.id)}>
                {a.title}
              </button>
            ))}
        </div>
      </section>
    </div>
  );

  const view = article && (
    <>
      <div className="pedia-crumbs">
        <button type="button" className="ghost small" onClick={() => visit(null)}>
          Civilopedia
        </button>
        <span aria-hidden="true">›</span>
        <button
          type="button"
          className="ghost small"
          onClick={() => {
            setOpen(new Set([article.category, `${article.category}|${article.group ?? ''}`]));
            setDrawer(true);
          }}
        >
          {catName(article.category)}
        </button>
        {article.group && article.group !== article.title && (
          <>
            <span aria-hidden="true">›</span>
            <span className="muted">{article.group}</span>
          </>
        )}
      </div>
      <header className="pedia-hero">
        <div className="pedia-hero-icon">
          <ArticleIcon article={article} size={52} content={content} />
        </div>
        <div>
          <span className="mx-chip gold">{article.kind}</span>
          <h3>{article.title}</h3>
          {article.subtitle && <p className="pedia-subtitle">{article.subtitle}</p>}
        </div>
      </header>
      <div className="pedia-content">
        {article.blocks.map((b, i) => {
          switch (b.kind) {
            case 'text':
              return (
                <p key={i} className="pedia-text">
                  {b.text}
                </p>
              );
            case 'facts':
              return b.rows.length ? (
                <dl key={i} className="pedia-facts">
                  {b.rows.map(([k, v]) => (
                    <div
                      key={k}
                      className={
                        v.reduce((n, p) => n + (typeof p === 'string' ? p : p.text).length, 0) > 28
                          ? 'wide'
                          : undefined
                      }
                    >
                      <dt>{k}</dt>
                      <dd>{inline(v)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null;
            case 'list':
              return (
                <section key={i} className="pedia-list-block">
                  <h4>{b.title}</h4>
                  <ul>
                    {b.items.map((it, j) => (
                      <li key={j}>{inline(it)}</li>
                    ))}
                  </ul>
                </section>
              );
            case 'links':
              return (
                <p key={i}>
                  <strong>{b.title}: </strong>
                  {inline(b.items)}
                </p>
              );
            case 'portrait':
              return (
                <div key={i} className="pedia-portrait">
                  <LeaderCard content={content} leader={b.leader} size={200} />
                </div>
              );
          }
        })}
      </div>
      {mentioned.length > 0 && (
        <section className="pedia-mentions">
          <h4>Mentioned in</h4>
          {group(showAllBack ? mentioned : mentioned.slice(0, 14)).map(([cat, items]) => (
            <div key={cat} className="pedia-mention-group">
              <span>{catName(cat)}</span>
              <div className="pedia-chips">
                {items.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="pedia-chip"
                    onClick={() => visit(a.id)}
                  >
                    <ArticleIcon article={a} size={16} content={content} /> {a.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {mentioned.length > 14 && !showAllBack && (
            <button type="button" className="ghost small" onClick={() => setShowAllBack(true)}>
              Show all {mentioned.length}
            </button>
          )}
        </section>
      )}
      {siblings.length > 1 && (
        <nav className="pedia-prevnext" aria-label="More like this">
          <button type="button" disabled={at <= 0} onClick={() => visit(siblings[at - 1]!.id)}>
            ‹ {siblings[at - 1]?.title ?? ''}
          </button>
          <small>
            {at + 1} of {siblings.length} in {article.group ?? catName(article.category)}
          </small>
          <button
            type="button"
            disabled={at >= siblings.length - 1}
            onClick={() => visit(siblings[at + 1]!.id)}
          >
            {siblings[at + 1]?.title ?? ''} ›
          </button>
        </nav>
      )}
    </>
  );

  return (
    <MenuScreen
      title="Civilopedia"
      icon="pedia"
      sub={article ? `${article.kind}: ${article.title}` : `${articles.length} articles`}
      onClose={onClose}
      className="mx-pedia"
      actions={
        <>
          <button
            type="button"
            className="ghost"
            disabled={history.at === 0}
            onClick={() => step(-1)}
            aria-label="Back (Alt+Left)"
            title="Back (Alt+Left)"
          >
            ◀
          </button>
          <button
            type="button"
            className="ghost"
            disabled={history.at >= history.stack.length - 1}
            onClick={() => step(1)}
            aria-label="Forward (Alt+Right)"
            title="Forward (Alt+Right)"
          >
            ▶
          </button>
          <button type="button" className="pedia-browse" onClick={() => setDrawer((d) => !d)}>
            {drawer ? 'Close' : 'Browse'}
          </button>
        </>
      }
    >
      <div className="pedia-layout">
        {sidebar}
        <article className="pedia-main" ref={articleRef} aria-live="polite">
          {article ? view : front}
        </article>
      </div>
    </MenuScreen>
  );
}

/** An article's icon: from the icon set, else a swatch of its color, else a dot. */
function ArticleIcon({
  article,
  size,
  content,
}: {
  article: Article;
  size: number;
  content: CompiledContent;
}) {
  if (article.id.startsWith('leader:'))
    return <LeaderHead content={content} leader={article.id.slice(7)} size={size} />;
  if (article.id.startsWith('civ:')) {
    const c = content.entities.civ[article.id.slice(4)];
    if (c)
      return (
        <Emblem
          symbol={c.emblem}
          primary={c.colors.primary}
          secondary={c.colors.secondary}
          size={size}
        />
      );
  }
  if (article.icon) return <Icon name={article.icon} size={size} />;
  return (
    <span
      className="pedia-swatch"
      style={{
        width: size * 0.7,
        height: size * 0.7,
        background: article.color ?? 'var(--gold-3)',
      }}
    />
  );
}
