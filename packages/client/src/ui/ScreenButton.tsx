import type { CSSProperties } from 'react';
import { Icon } from './Icon';
import { ICONS } from './icons';

/**
 * A button in the top bar that opens one of the game's screens: the glyph alone, in brass, in a
 * dark well that lights up in the screen's own color on hover.
 */
export function ScreenButton({
  icon,
  label,
  badge,
  onClick,
}: {
  icon: string;
  label: string;
  /** A small count or note on the button (envoys to send, empty policy slots...). */
  badge?: string | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="screen-button"
      title={label}
      aria-label={label}
      style={{ '--tone': ICONS[icon]?.bg ?? '#c9a14f' } as CSSProperties}
      onClick={onClick}
    >
      <Icon name={icon} variant="glyph" size={21} />
      {badge && <span className="screen-badge">{badge}</span>}
    </button>
  );
}
