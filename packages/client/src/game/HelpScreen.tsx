import { useState } from 'react';
import { advisorsOn, setAdvisors } from './advisors';
import { hintsOn, setHints } from './hints';
import { Icon } from '../ui/Icon';
import { Switch, useEscape } from '../ui/Menu';

export const KEYS: [string, string][] = [
  ['Enter', 'The next thing that needs you (then End turn)'],
  ['Esc', 'Close a screen, cancel placing, deselect'],
  ['Arrows / W A S D', 'Move the map'],
  ['+ / −', 'Zoom in and out'],
  ['Space', 'Skip the selected unit this turn'],
  ['B', 'Found a settlement with the selected settler'],
  ['F', 'Fortify the selected unit'],
  ['Z', 'Sleep the selected unit'],
  ['Ctrl Z', 'Single player: take back the last move (if it revealed nothing new)'],
  ['F5 / F9', 'Quick save / quick load (not online)'],
  ['T', 'Technologies'],
  ['C', 'Civics'],
  ['G', 'Government and policies'],
  ['O', 'Governors: appoint, promote and post them'],
  ['P', 'Great people'],
  ['K', 'Great works: what hangs where, theming, moving works'],
  ['Y', 'Espionage: send spies and choose their missions'],
  ['U', 'World Congress: favor, votes, diplomatic victory'],
  ['X', 'Climate: emissions, rising seas, the latest disasters'],
  ['R', 'Religion'],
  ['I', 'City-states'],
  ['V', 'Victories'],
  ['E', 'Eras and ages: era score, dedications, timeline'],
  ['H', 'Graphs'],
  ['L', 'Next map lens'],
  ['M', 'Online: ping the tile under the mouse for everyone'],
  ['/', 'Online: chat'],
  ['?', 'This screen'],
  ['F1', 'Civilopedia: every unit, building, wonder, leader and rule'],
];

export const MOUSE: [string, string][] = [
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
export function HelpScreen({
  onClose,
  onPedia,
}: {
  onClose: () => void;
  /** Opens the Civilopedia instead. */
  onPedia?: () => void;
}) {
  useEscape(onClose);
  const [hints, setOn] = useState(hintsOn);
  const [advisors, setAdvisorsOn] = useState(advisorsOn);
  return (
    <div className="screen" role="dialog" aria-label="Help">
      <header className="screen-head">
        <h2>
          <Icon name="help" size={30} />
          Help
        </h2>
        <p className="screen-sub">
          Every number has a breakdown: hover it to see why.{' '}
          {onPedia && (
            <button type="button" className="pedia-link" onClick={onPedia}>
              Open the Civilopedia (F1)
            </button>
          )}
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="help-body">
        <section>
          <h3>Keyboard</h3>
          <dl className="keys mx-keys">
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
          <dl className="keys mx-keys">
            {MOUSE.map(([k, what]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
          <h3>Hints and advisors</h3>
          <div className="help-switches">
            <Switch
              label="First-game hints"
              hint="A short note the first time something this game does its own way comes up. Turning them on starts them over."
              checked={hints}
              onChange={(on) => {
                setHints(on);
                setOn(on);
              }}
            />
            <Switch
              label="Advisors"
              hint="Each turn, tips from your military, economic, culture and foreign advisors."
              checked={advisors}
              onChange={(on) => {
                setAdvisors(on);
                setAdvisorsOn(on);
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
