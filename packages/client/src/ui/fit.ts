import { type RefObject, useLayoutEffect } from 'react';

/**
 * Makes a row fit its box by dropping detail instead of clipping it: the element gets
 * `data-fit="0"` (everything shows) and, while its content is still wider than the box, the
 * next level up to `levels`. The stylesheet decides what each level leaves out (the top bar's
 * yields: hud.css), least important first.
 *
 * `key` is anything that changes when the content does (the numbers shown), so the fit is
 * worked out again; it is also redone when the element's parent changes size and once the fonts
 * have loaded. The level is set on the element directly, before the browser paints, so nothing
 * flickers.
 */
export function useFit(ref: RefObject<HTMLElement | null>, levels: number, key: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let level = 0;
      el.dataset.fit = '0';
      while (level < levels && el.scrollWidth > el.clientWidth + 1) {
        level++;
        el.dataset.fit = String(level);
      }
    };
    fit();
    // The box's own width follows its content, so it is the parent that is watched.
    const target = el.parentElement;
    const observer =
      typeof ResizeObserver !== 'undefined' && target ? new ResizeObserver(fit) : undefined;
    if (target) observer?.observe(target);
    let live = true;
    void document.fonts?.ready.then(() => live && fit());
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [ref, levels, key]);
}
