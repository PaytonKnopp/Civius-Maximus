import type { CompiledContent } from '@cx/content';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import {
  type Article,
  buildArticles,
  CATEGORIES,
  type CategoryId,
  type Inline,
  searchArticles,
} from './civilopedia';

/**
 * The Civilopedia (docs/06-ui-ux.md): categories, a searchable list and the article, with links
 * between articles and a back button.
 */
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
  const start = (initial && byId.get(initial)) || articles[0]!;
  const [category, setCategory] = useState<CategoryId>(start.category);
  const [open, setOpen] = useState<string>(start.id);
  const [trail, setTrail] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    // (Some browsers return a promise from scrollTo; an effect must return nothing.)
    articleRef.current?.scrollTo?.(0, 0);
  }, [open]);

  const go = (id: string) => {
    const a = byId.get(id);
    if (!a || id === open) return;
    setTrail((t) => [...t, open]);
    setOpen(id);
    setCategory(a.category);
  };
  const back = () => {
    const prev = trail[trail.length - 1];
    if (!prev) return;
    setTrail((t) => t.slice(0, -1));
    setOpen(prev);
    setCategory(byId.get(prev)!.category);
  };

  const list = query.trim()
    ? searchArticles(articles, query).slice(0, 80)
    : articles.filter((a) => a.category === category);
  const groups: [string, Article[]][] = [];
  for (const a of list) {
    const g = query.trim()
      ? (CATEGORIES.find((c) => c.id === a.category)?.name ?? '')
      : (a.group ?? '');
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(a);
    else groups.push([g, [a]]);
  }
  const article = byId.get(open)!;
  const inline = (parts: Inline[]) =>
    parts.map((p, i) =>
      typeof p === 'string' ? (
        <span key={i}>{p}</span>
      ) : (
        <button key={i} type="button" className="pedia-link" onClick={() => go(p.link)}>
          {p.text}
        </button>
      ),
    );

  return (
    <div className="screen pedia-screen" role="dialog" aria-label="Civilopedia">
      <header className="screen-head">
        <h2>
          <Icon name="pedia" size={30} />
          Civilopedia
        </h2>
        <input
          className="pedia-search"
          type="search"
          placeholder="Search"
          aria-label="Search the Civilopedia"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="pedia-body">
        <nav className="pedia-cats" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.id === category && !query.trim() ? 'on' : ''}
              onClick={() => {
                setQuery('');
                setCategory(c.id);
              }}
            >
              {c.name}
            </button>
          ))}
        </nav>
        <div className="pedia-list" aria-label="Articles">
          {groups.map(([g, items]) => (
            <section key={g || 'all'}>
              {g && <h4>{g}</h4>}
              {items.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={a.id === open ? 'on' : ''}
                  onClick={() => go(a.id)}
                >
                  {a.title}
                </button>
              ))}
            </section>
          ))}
          {list.length === 0 && <p className="hint">Nothing matches.</p>}
        </div>
        <article className="pedia-article" ref={articleRef}>
          <div className="pedia-article-head">
            {trail.length > 0 && (
              <button type="button" className="pedia-back" onClick={back}>
                ← Back
              </button>
            )}
            <h3>{article.title}</h3>
            {article.subtitle && <p className="screen-sub">{article.subtitle}</p>}
          </div>
          {article.blocks.map((b, i) =>
            b.kind === 'text' ? (
              <p key={i}>{b.text}</p>
            ) : b.kind === 'facts' ? (
              <dl key={i} className="pedia-facts">
                {b.rows.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{inline(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p key={i}>
                <strong>{b.title}: </strong>
                {inline(b.items)}
              </p>
            ),
          )}
        </article>
      </div>
    </div>
  );
}
