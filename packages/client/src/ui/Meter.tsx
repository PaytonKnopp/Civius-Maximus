import type { CSSProperties, ReactNode } from 'react';

/**
 * A progress meter: a slim bar filling in a color, with the value beside it ("2/3"). Used
 * wherever a screen shows how far along something is, so progress reads at a glance.
 */
export function Meter({
  value,
  max,
  tone = 'var(--gold)',
  label,
  title,
}: {
  value: number;
  max: number;
  tone?: string;
  label?: ReactNode;
  title?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span
      className={`meter ${pct >= 100 ? 'full' : ''}`}
      style={{ '--pct': `${pct}%`, '--tone': tone } as CSSProperties}
      title={title}
    >
      <span className="meter-bar" aria-hidden="true">
        <span />
      </span>
      <span className="meter-text">{label ?? `${value}/${max}`}</span>
    </span>
  );
}
