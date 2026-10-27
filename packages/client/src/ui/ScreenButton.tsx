import { Icon } from './Icon';

/** A round button in the top bar that opens one of the game's screens. */
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
      onClick={onClick}
    >
      <Icon name={icon} size={28} />
      {badge && <span className="screen-badge">{badge}</span>}
    </button>
  );
}
