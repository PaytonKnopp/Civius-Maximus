import { useEffect, useRef, useState } from 'react';
import { Rich } from './Icon';

/**
 * The game's tooltips (docs/06-ui-ux.md, "Tooltips"): one styled card that follows whatever
 * the pointer rests on, instead of the browser's plain ones. Any element with a `title` (or a
 * `data-tip`) gets it: the title moves into `data-tip` the first time the pointer arrives, so the
 * browser's own tooltip never shows. Lines split on newlines; the game's yield emoji show as
 * icons; a first line ending in "(K)" shows the K as a key.
 */
export function Tooltips() {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || matchMedia('(pointer: coarse)').matches) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: Element | null = null;
    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[title], [data-tip]');
      if (!el || el === current) return;
      // Inline SVG keeps its own <title> children; only attributes move.
      const title = el.getAttribute('title');
      if (title !== null) {
        el.removeAttribute('title');
        if (title.trim()) {
          el.setAttribute('data-tip', title);
          if (!el.getAttribute('aria-label') && !el.textContent?.trim())
            el.setAttribute('aria-label', title.split('\n')[0]!);
        }
      }
      const text = el.getAttribute('data-tip');
      clearTimeout(timer);
      current = el;
      if (!text) return setTip(null);
      timer = setTimeout(() => {
        if (current === el && el.isConnected) setTip({ text, rect: el.getBoundingClientRect() });
      }, 280);
    };
    const out = (e: PointerEvent) => {
      if (!current) return;
      const to = e.relatedTarget as Node | null;
      if (to && current.contains(to)) return;
      hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    document.addEventListener('wheel', hide, { passive: true, capture: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      document.removeEventListener('wheel', hide, true);
    };
  }, []);

  // Below the element when there's room, else above; kept on screen.
  useEffect(() => {
    if (!tip || !card.current) return setPos(null);
    const { width, height } = card.current.getBoundingClientRect();
    const r = tip.rect;
    const gap = 8;
    let top = r.bottom + gap;
    if (top + height > innerHeight - 8) top = Math.max(8, r.top - gap - height);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), innerWidth - width - 8);
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  const [first, ...rest] = tip.text.split('\n');
  const key = /^(.*?)\s*\(([^()]{1,6})\)$/.exec(first ?? '');
  return (
    <div
      ref={card}
      className="game-tip"
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
    >
      <div className="game-tip-title">
        <Rich text={key ? key[1]! : (first ?? '')} />
        {key && <kbd>{key[2]}</kbd>}
      </div>
      {rest.map((line, i) => (
        <div key={i} className="game-tip-line">
          <Rich text={line} />
        </div>
      ))}
    </div>
  );
}
