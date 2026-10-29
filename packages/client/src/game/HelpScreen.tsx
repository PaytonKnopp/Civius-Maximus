import { useEffect, useState } from 'react';
import { hintsOn, setHints } from './hints';
import { Icon } from '../ui/Icon';

const KEYS: [string, string][] = [
  ['Enter', 'The next thing that needs you (then End turn)'],
  ['Esc', 'Close a screen, cancel placing, deselect'],
  ['Space', 'Skip the selected unit this turn'],
  ['B', 'Found a settlement with the selected settler'],
  ['F', 'Fortify the selected unit'],
  ['Z', 'Sleep the selected unit'],
  ['T', 'Technologies'],
  ['C', 'Civics'],
  ['G', 'Government and policies'],
  ['O', 'Governors: appoint, promote and post them'],
  ['P', 'Great people'],
  ['K', 'Great works: what hangs where, theming, moving works'],
  ['R', 'Religion'],
  ['I', 'City-states'],
  ['V', 'Victories'],
  ['E', 'Eras and ages: era score, dedications, timeline'],
  ['H', 'Graphs'],
  ['L', 'Next map lens'],
  ['?', 'This screen'],
];

const MOUSE: [string, string][] = [
  [
    'Click',
    'Select a unit or settlement (again to cycle what’s on the tile); a tile to inspect it',
  ],
  ['Click, click', 'With a unit selected: show the path to a tile, then go'],
  ['Right-click', 'With a unit selected: go there, or attack'],
  ['Drag', 'Pan the map'],
  ['Wheel / pinch', 'Zoom'],
];

/** Every shortcut on one screen, and the switch for first-game hints. */
export function HelpScreen({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const [hints, setOn] = useState(hintsOn);
  return (
    <div className="screen" role="dialog" aria-label="Help">
      <header className="screen-head">
        <h2>
          <Icon name="help" size={30} />
          Help
        </h2>
        <p className="screen-sub">Every number has a breakdown: hover it to see why.</p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="help-body">
        <section>
          <h3>Keyboard</h3>
          <dl className="keys">
            {KEYS.map(([k, what]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3>Mouse and touch</h3>
          <dl className="keys">
            {MOUSE.map(([k, what]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
          <h3>First-game hints</h3>
          <label className="toggle">
            <input
              type="checkbox"
              checked={hints}
              onChange={(e) => {
                setHints(e.target.checked);
                setOn(e.target.checked);
              }}
            />{' '}
            Show a short note the first time something new comes up (turning this on starts them
            over)
          </label>
        </section>
      </div>
    </div>
  );
}
