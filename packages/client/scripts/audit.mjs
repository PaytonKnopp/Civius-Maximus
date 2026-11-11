// A DOM audit the screenshot scripts run on each screen they capture: things a screenshot review
// misses or can't check by eye at every size. `auditPage(page, name, options)` returns a list of
// findings, each `{ check, name, what, where }`:
//
//   raw       raw ids (`unit_warrior`), `undefined`, `NaN`, `[object Object]`, unresolved text
//             keys and template braces in visible text
//   emoji     emoji in visible text (the game draws its own icons)
//   grammar   "1 turns", "a Encampment", doubled spaces or punctuation
//   clipped   text cut off by its box with no ellipsis (`ellipsis` lists the ones that end in …)
//   offscreen visible elements partly outside the window that no scrolling box holds
//   cut       text partly hidden by a box that doesn't scroll (a label sliced by its neighbor)
//   hscroll   a box that scrolls sideways (fine for a strip made to, a defect anywhere else)
//   covered   a button or link with something else drawn over its middle
//   contrast  text under 3:1 against its background (4.5:1 is the comfortable target; anything
//             under 3 is hard to read)
//   target    (touch sizes) buttons and links smaller than 44 px on a side
//
// The checks are heuristics: a finding is something to look at, not a verdict.
// Used by review-screens.mjs; `node scripts/audit.mjs` on its own does nothing.

/** Runs in the page. `opts`: { touch: boolean, root?: selector to limit the audit to }. */
export function auditInPage(opts) {
  const W = document.documentElement.clientWidth;
  const H = document.documentElement.clientHeight;
  const root = (opts.root && document.querySelector(opts.root)) || document.body;
  const out = [];
  const add = (check, what, el) => {
    const where = [];
    for (let e = el, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) {
      const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : '';
      where.unshift(`${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`);
    }
    out.push({ check, what: String(what).slice(0, 160), where: where.join(' > ') });
  };
  const styleOf = (el) => getComputedStyle(el);
  const shown = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = styleOf(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05)
        return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  /** Inside the window (not scrolled out of a scrolling box, not clipped away by a parent). */
  const onScreen = (el) => {
    let r = el.getBoundingClientRect();
    let left = r.left;
    let right = r.right;
    let top = r.top;
    let bottom = r.bottom;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = styleOf(p);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect();
        if (s.overflowX !== 'visible') {
          left = Math.max(left, pr.left);
          right = Math.min(right, pr.right);
        }
        if (s.overflowY !== 'visible') {
          top = Math.max(top, pr.top);
          bottom = Math.min(bottom, pr.bottom);
        }
      }
    }
    left = Math.max(left, 0);
    top = Math.max(top, 0);
    right = Math.min(right, W);
    bottom = Math.min(bottom, H);
    return right - left > 1 && bottom - top > 1;
  };

  // --- Text checks -------------------------------------------------------------------------
  const RAW_ID =
    /\b(?:unit|tech|civic|building|district|wonder|improvement|resource|feature|terrain|policy|government|belief|leader|civ|project|promotion|era|age|governor|moment|dedication|resolution|disaster|yield|specialization|great_person|gp|city_state|cs|script|size|speed|difficulty|mission|class)_[a-z0-9]+(?:_[a-z0-9]+)*\b/;
  const DEBUG = /\bundefined\b|\bNaN\b|\[object |\bnull\b|Infinity|\{\{|\}\}|\$\{|%s\b|%d\b/;
  const KEY = /(?:^|\s)@[a-z][\w.]*|^[a-z]+(?:\.[a-zA-Z0-9_]+){2,}$/;
  const EMOJI = /\p{Extended_Pictographic}/u;
  // Glyphs the design uses as text on purpose (arrows, the close cross, bullets, check marks).
  const GLYPH_OK = /[←→↑↓↔↶↷✕✓•·●○◆◇▲▼◀▶★☆☰©®™‹›«»–—−×÷…]/gu;
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName)) continue;
    if (!shown(el) || !onScreen(el)) continue;
    const key = text;
    if (seen.has(key)) continue;
    seen.add(key);
    if (RAW_ID.test(text)) add('raw', `raw id in "${text}"`, el);
    if (DEBUG.test(text)) add('raw', `debug text in "${text}"`, el);
    if (KEY.test(text) && !/^\w+\.(com|org|io|md|json|ts)\b/.test(text))
      add('raw', `text key "${text}"`, el);
    if (EMOJI.test(text.replace(GLYPH_OK, ''))) add('emoji', `"${text}"`, el);
    if (
      /\b1 (?:turns|units|tiles|points|citizens|settlements|cities|envoys|slots|games)\b/.test(text)
    )
      add('grammar', `"${text}"`, el);
    if (
      /\ba (?:[aeioAEIO]\w+)/.test(text) &&
      !/\ba (?:one|once|unit|uni\w*|use\w*|usu\w*|eu\w*|ew\w*|o'\w*)\b/i.test(text)
    )
      add('grammar', `a/an: "${text}"`, el);
    if (
      /\ban (?:[bcdfgjklmnpqrstvwxyzBCDFGJKLMNPQRSTVWXYZ]\w+)/.test(text) &&
      !/\ban (?:[A-Z]{2,})\b/.test(text)
    )
      add('grammar', `a/an: "${text}"`, el);
    if (
      / {2,}| [,.;:!?](?:\s|$)|[,;:]{2}|\.\.(?!\.)|(?<!\.)\.\.$/.test(
        n.nodeValue.replace(/\s*\n\s*/g, ' ').trim(),
      )
    )
      add('grammar', `spacing or punctuation: "${text}"`, el);
  }

  // --- Box checks --------------------------------------------------------------------------
  const all = root.querySelectorAll('*');
  const COLOR = /rgba?\([^)]+\)|color\(srgb [^)]+\)/g;
  const parseColor = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) {
      const p = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    // `color-mix()` computes to color(srgb r g b / a), each channel 0 to 1.
    const s2 = /color\(srgb ([^)]+)\)/.exec(c);
    if (!s2) return null;
    const p = s2[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => {
    const a = top.a + under.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + under.r * under.a * (1 - top.a)) / a,
      g: (top.g * top.a + under.g * under.a * (1 - top.a)) / a,
      b: (top.b * top.a + under.b * under.a * (1 - top.a)) / a,
      a,
    };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** The colors behind an element: every gradient stop or flat color, composited down to an
   * opaque base (the page behind a game screen is dark sea, so that is the last resort). */
  const backgrounds = (el) => {
    let layers = [{ r: 0, g: 0, b: 0, a: 0 }];
    /** Paints one layer (its gradient stops, or one flat color) under what's there so far. */
    const under = (stops) => {
      const next = [];
      for (const base of layers)
        for (const c of stops) next.push(base.a >= 0.98 ? base : over(base, c));
      // Keep the extremes when the combinations multiply.
      next.sort((a, b) => lum(a) - lum(b));
      layers = next.length > 16 ? [...next.slice(0, 8), ...next.slice(-8)] : next;
    };
    for (let e = el; e; e = e.parentElement) {
      const s = styleOf(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        // Each gradient layer in turn, top to bottom (pictures have no colors to read).
        for (const layer of s.backgroundImage.split(
          /,\s*(?=(?:linear|radial|conic|repeating|url))/,
        )) {
          const stops = [...layer.matchAll(COLOR)].map((m) => parseColor(m[0])).filter(Boolean);
          if (stops.length > 0) under(stops);
        }
      }
      const flat = parseColor(s.backgroundColor);
      if (flat && flat.a > 0.02) under([flat]);
      if (layers.every((c) => c.a >= 0.98)) break;
    }
    const sea = { r: 10, g: 20, b: 34, a: 1 };
    return layers.map((c) => (c.a >= 0.98 ? c : over(c, sea)));
  };

  const clippedSeen = new Set();
  for (const el of all) {
    if (el.tagName === 'CANVAS' || el.tagName === 'svg' || el.closest('svg')) continue;
    if (!shown(el)) continue;
    const s = styleOf(el);
    const r = el.getBoundingClientRect();
    const ownText = [...el.childNodes]
      .filter((c) => c.nodeType === 3)
      .map((c) => c.nodeValue)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

    // Text cut off by its own box.
    if (ownText && onScreen(el)) {
      const cutX = el.scrollWidth > el.clientWidth + 1 && s.overflowX !== 'visible';
      const clamp = s.webkitLineClamp && s.webkitLineClamp !== 'none';
      const cutY =
        el.scrollHeight > el.clientHeight + 3 &&
        s.overflowY !== 'visible' &&
        s.overflowY !== 'auto' &&
        s.overflowY !== 'scroll';
      if ((cutX || cutY) && !clippedSeen.has(ownText)) {
        clippedSeen.add(ownText);
        if (cutX && s.textOverflow === 'ellipsis') add('ellipsis', `"${ownText}"`, el);
        else if (cutY && clamp) add('ellipsis', `(clamped) "${ownText}"`, el);
        else if (cutX && (s.overflowX === 'auto' || s.overflowX === 'scroll')) {
          // A strip that scrolls sideways on purpose.
        } else add('clipped', `"${ownText}"`, el);
      }
    }

    // Text partly hidden by a parent that clips it: sliced by a box that doesn't scroll, or
    // (sideways) pushed out of a strip that does.
    if (ownText && onScreen(el) && r.width > 2) {
      let left = r.left;
      let right = r.right;
      let clipper = null;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ps = styleOf(p);
        if (ps.overflowX === 'visible') continue;
        const pr = p.getBoundingClientRect();
        if (pr.left > left + 1 || pr.right < right - 1) {
          left = Math.max(left, pr.left);
          right = Math.min(right, pr.right);
          clipper = p;
        }
      }
      // The tech and civic trees are a surface made to be panned.
      if (clipper?.classList.contains('tree')) clipper = null;
      if (clipper && right - left < r.width - 2 && !clippedSeen.has(`cut:${ownText}`)) {
        clippedSeen.add(`cut:${ownText}`);
        const scrolls = ['auto', 'scroll'].includes(styleOf(clipper).overflowX);
        const cls = typeof clipper.className === 'string' ? clipper.className.split(/\s+/)[0] : '';
        add(
          scrolls ? 'hscroll' : 'cut',
          `"${ownText.slice(0, 60)}" shows ${Math.round(right - left)} of ${Math.round(r.width)} px inside ${clipper.tagName.toLowerCase()}.${cls}`,
          el,
        );
      }
    }

    // A control with something else drawn over its middle.
    if (
      onScreen(el) &&
      (['BUTTON', 'A', 'SELECT', 'INPUT'].includes(el.tagName) ||
        ['button', 'tab', 'option', 'menuitem'].includes(el.getAttribute('role') ?? ''))
    ) {
      const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2));
      const y = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
      // Only when its middle is inside the window and not scrolled out of its box.
      let inBox = r.left + r.width / 2 === x && r.top + r.height / 2 === y;
      for (let p = el.parentElement; p && inBox; p = p.parentElement) {
        const ps = styleOf(p);
        if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
        const pr = p.getBoundingClientRect();
        if (x < pr.left || x > pr.right || y < pr.top || y > pr.bottom) inBox = false;
      }
      const top = inBox ? document.elementFromPoint(x, y) : null;
      if (top && top !== el && !el.contains(top) && !top.contains(el)) {
        // A label drawn over its own input, or a decoration that ignores the pointer, is fine.
        const label = top.closest('label');
        // Under a dialog's backdrop or a full screen, everything is covered on purpose.
        let layer = false;
        for (let p = top; p && !p.contains(el) && !layer; p = p.parentElement) {
          const pr = p.getBoundingClientRect();
          layer = pr.width * pr.height >= W * H * 0.6;
        }
        if (!layer && !(label && label.contains(el)) && styleOf(top).pointerEvents !== 'none') {
          const cls = typeof top.className === 'string' ? top.className.split(/\s+/)[0] : '';
          add(
            'covered',
            `"${(ownText || el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.tagName).trim().slice(0, 40)}" is under ${top.tagName.toLowerCase()}.${cls}`,
            el,
          );
        }
      }
    }

    // Sticking out of the window with nothing to scroll it back.
    if (r.right > W + 1 || r.left < -1 || r.bottom > H + 1 || r.top < -1) {
      let held = false;
      for (let p = el.parentElement; p && !held; p = p.parentElement) {
        const ps = styleOf(p);
        const pr = p.getBoundingClientRect();
        const holdsX = ps.overflowX !== 'visible' && pr.right <= W + 1 && pr.left >= -1;
        const holdsY = ps.overflowY !== 'visible' && pr.bottom <= H + 1 && pr.top >= -1;
        const outX = r.right > W + 1 || r.left < -1;
        const outY = r.bottom > H + 1 || r.top < -1;
        held = (!outX || holdsX) && (!outY || holdsY);
      }
      // The page itself scrolls on some phone layouts (the title screen): only the sideways
      // direction counts there.
      const pageScrolls = document.documentElement.scrollHeight > H + 1;
      const outX = r.right > W + 1 || r.left < -1;
      if (
        !held &&
        (outX || !pageScrolls) &&
        (ownText || el.tagName === 'BUTTON' || el.tagName === 'IMG')
      ) {
        add(
          'offscreen',
          `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} in ${W}x${H}: "${(ownText || el.getAttribute('aria-label') || el.tagName).slice(0, 60)}"`,
          el,
        );
      }
    }

    // Contrast of text against what is behind it.
    if (ownText && onScreen(el) && !el.closest('[disabled], [aria-disabled="true"], .disabled')) {
      const fg = parseColor(s.color);
      if (fg && fg.a > 0.05) {
        const bgs = backgrounds(el);
        let worst = Infinity;
        let worstBg = null;
        for (const bg of bgs) {
          const c = ratio(over(fg, bg), bg);
          if (c < worst) {
            worst = c;
            worstBg = bg;
          }
        }
        const size = parseFloat(s.fontSize);
        const limit = 3;
        if (worst < limit) {
          const hex = (c) =>
            `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
          add(
            'contrast',
            `${worst.toFixed(2)}:1 ${hex(over(fg, worstBg))} on ${hex(worstBg)} ${Math.round(size)}px "${ownText.slice(0, 50)}"`,
            el,
          );
        }
      }
    }

    // Touch targets.
    if (opts.touch && onScreen(el)) {
      const interactive =
        ['BUTTON', 'A', 'SELECT', 'INPUT', 'TEXTAREA', 'SUMMARY'].includes(el.tagName) ||
        el.getAttribute('role') === 'button' ||
        el.getAttribute('role') === 'tab';
      if (interactive && !el.disabled && (r.width < 43.5 || r.height < 43.5)) {
        // A small control inside a big clickable label or row is fine.
        const label = el.closest('label');
        const lr = label?.getBoundingClientRect();
        if (!(lr && lr.width >= 44 && lr.height >= 44))
          add(
            'target',
            `${Math.round(r.width)}x${Math.round(r.height)} "${(ownText || el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.tagName).trim().slice(0, 40)}"`,
            el,
          );
      }
    }
  }
  return out;
}

/**
 * Waits until the page has stopped moving: every animation and transition that ends has ended
 * (a screen's fade-in, a panel sliding in), then two more frames. A screenshot taken right
 * after a click on a slow machine otherwise shows the frame before the click took effect.
 */
export async function quiet(page, timeout = 6000) {
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => {
          const timing = a.effect?.getComputedTiming();
          return a.playState !== 'running' || timing?.iterations === Infinity;
        }),
      null,
      { timeout },
    )
    .catch(() => {});
  await page.evaluate(
    () =>
      new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))),
  );
}

/** Audits what the page shows now. `name` labels the findings; `touch` adds target sizes. */
export async function auditPage(page, name, { touch = false, root } = {}) {
  const found = await page.evaluate(auditInPage, { touch, root });
  return found.map((f) => ({ ...f, name }));
}

/** Findings grouped by what and where, with the screens each was seen on. */
export function summarize(findings) {
  const groups = new Map();
  for (const f of findings) {
    // Numbers in the text (positions, sizes, counts) vary by screen size; group without them.
    const key = `${f.check}|${f.where}|${f.what.replace(/\d+(\.\d+)?/g, '#')}`;
    const g = groups.get(key) ?? { ...f, names: new Set() };
    g.names.add(f.name);
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.check.localeCompare(b.check) || b.names.size - a.names.size)
    .map((g) => {
      const names = [...g.names];
      return `[${g.check}] ${g.what}\n    at ${g.where}\n    on ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` (+${names.length - 6} more)` : ''}`;
    });
}
