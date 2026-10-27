import { Fragment, type ReactNode } from 'react';
import { EMOJI_ICONS, ICONS, type Shape } from './icons';

const TONES = { dark: 'rgba(0,0,0,0.42)', light: 'rgba(255,255,255,0.55)' } as const;

interface Props {
  name: string;
  /** Pixel size (defaults to the text size). */
  size?: number | string;
  /** `badge` (default): the colored disc; `glyph`: the shape alone, in the current color. */
  variant?: 'badge' | 'glyph';
  title?: string;
  className?: string;
}

/** One icon from the set, as inline SVG. Unknown names render nothing. */
export function Icon({ name, size = '1.25em', variant = 'badge', title, className }: Props) {
  const def = ICONS[name];
  if (!def) return null;
  const id = `ig-${name}`;
  const fill = (sh: Shape) =>
    sh.tone ? TONES[sh.tone] : variant === 'glyph' ? 'currentColor' : '#fff';
  return (
    <svg
      className={`icon icon-${variant} ${className ?? ''}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {variant === 'badge' && (
        <>
          <defs>
            <radialGradient id={id} cx="38%" cy="30%" r="75%">
              <stop offset="0" stopColor={def.bg} stopOpacity="0.75" />
              <stop offset="0.55" stopColor={def.bg} />
              <stop offset="1" stopColor={def.bg} stopOpacity="1" />
            </radialGradient>
          </defs>
          <circle cx="12" cy="12" r="11.4" fill="#1b140a" />
          <circle cx="12" cy="12" r="10.6" fill={def.bg} />
          <circle cx="12" cy="12" r="10.6" fill={`url(#${id})`} />
          <circle
            cx="12"
            cy="12"
            r="10.6"
            fill="none"
            stroke="rgba(255,236,190,0.55)"
            strokeWidth="0.8"
          />
        </>
      )}
      <g transform={variant === 'badge' ? 'translate(2.4 2.4) scale(0.8)' : undefined}>
        {def.glyph.map((sh, i) => (
          <path key={i} d={sh.d} fill={fill(sh)} fillRule={sh.holes ? 'evenodd' : 'nonzero'} />
        ))}
      </g>
    </svg>
  );
}

const EMOJI = new RegExp(
  `(${Object.keys(EMOJI_ICONS)
    .sort((a, b) => b.length - a.length)
    .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})`,
  'u',
);

/** Text with the game's emoji (yields, war...) shown as icons: "+2🔬" → +2 and the science icon. */
export function Rich({ text, size }: { text: string; size?: number | string }): ReactNode {
  const parts = text.split(EMOJI);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Icon key={i} name={EMOJI_ICONS[part]!} {...(size !== undefined ? { size } : {})} />
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Splits text into plain runs and icon names, for drawing on a canvas. */
export function richParts(text: string): { text?: string; icon?: string }[] {
  return text
    .split(EMOJI)
    .map((part, i) => (i % 2 === 1 ? { icon: EMOJI_ICONS[part]! } : { text: part }))
    .filter((p) => p.icon || p.text);
}
