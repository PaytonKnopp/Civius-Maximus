import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Icon } from './Icon';

/**
 * The pieces every menu screen is made of (title screen, options, game setup, Civilopedia, Hall
 * of Fame, saves): one shell, one set of controls, one Escape rule. Styles: menu.css (`mx-`).
 */

// --- Escape ---------------------------------------------------------------------------------

const escapeStack: (() => void)[] = [];
let listening = false;

function onEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const top = escapeStack[escapeStack.length - 1];
  if (!top) return;
  e.preventDefault();
  top();
}

/**
 * Escape closes the topmost thing that asked for it (a picker over a screen closes before the
 * screen does). `active` false leaves the key to whatever is underneath.
 */
export function useEscape(handler: () => void, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const fn = () => ref.current();
    escapeStack.push(fn);
    if (!listening) {
      window.addEventListener('keydown', onEscape);
      listening = true;
    }
    return () => {
      const i = escapeStack.lastIndexOf(fn);
      if (i >= 0) escapeStack.splice(i, 1);
    };
  }, [active]);
}

// --- The shell ------------------------------------------------------------------------------

export function MenuScreen({
  title,
  icon,
  sub,
  onClose,
  closeLabel = 'Back',
  actions,
  children,
  className = '',
  escape = true,
}: {
  title: ReactNode;
  icon?: string;
  sub?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** Controls in the header, between the title and the close button. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Escape closes this screen (off when it handles Escape itself). */
  escape?: boolean;
}) {
  useEscape(onClose, escape);
  const label = typeof title === 'string' ? title : undefined;
  return (
    <div className={`mx ${className}`} role="dialog" aria-label={label} aria-modal="true">
      <header className="mx-head">
        <button type="button" className="mx-back" onClick={onClose}>
          <span aria-hidden="true">‹</span> {closeLabel}
        </button>
        <div className="mx-title">
          <h2>
            {icon && <Icon name={icon} size={26} />}
            {title}
          </h2>
          {sub && <p className="mx-sub">{sub}</p>}
        </div>
        {actions && <div className="mx-actions">{actions}</div>}
      </header>
      <div className="mx-body">{children}</div>
    </div>
  );
}

// --- Controls -------------------------------------------------------------------------------

/** A row: a label and its hint on the left, the control on the right. */
export function Row({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="mx-row">
      <label className="mx-row-text" htmlFor={htmlFor}>
        <span className="mx-row-label">{label}</span>
        {hint && <span className="mx-row-hint">{hint}</span>}
      </label>
      <div className="mx-row-control">{children}</div>
    </div>
  );
}

/** An on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`mx-row mx-switch-row ${disabled ? 'off' : ''}`}>
      <label className="mx-row-text" htmlFor={id}>
        <span className="mx-row-label">{label}</span>
        {hint && <span className="mx-row-hint">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`mx-switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="mx-switch-knob" />
      </button>
    </div>
  );
}

/** A row of choices, one on. */
export function Choice<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`mx-choice ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A slider with its value shown. */
export function Slider({
  value,
  onChange,
  label,
  min = 0,
  max = 100,
  step = 1,
  format = (n) => `${n}`,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  format?: (n: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mx-slider">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{format(value)}</output>
    </div>
  );
}

/** A section heading inside a screen's panel. */
export function Section({
  title,
  hint,
  children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mx-section">
      <h3>{title}</h3>
      {hint && <p className="mx-section-hint">{hint}</p>}
      {children}
    </section>
  );
}
