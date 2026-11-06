import { useState } from 'react';
import { audio, type AudioSettings, music, play } from '../audio';
import { advisorsOn, setAdvisors } from '../game/advisors';
import { hintsOn, setHints } from '../game/hints';
import { KEYS, MOUSE } from '../game/HelpScreen';
import { clearHallOfFame, hallOfFame } from '../game/hallOfFame';
import {
  hasWebGL2,
  isFullscreen,
  resetSettings,
  setSettings,
  toggleFullscreen,
  useSettings,
} from '../settings';
import { BUILD_ID, versionLabel } from '../update';
import { Icon } from '../ui/Icon';
import { Choice, MenuScreen, Row, Section, Slider, Switch } from '../ui/Menu';

type Tab = 'sound' | 'graphics' | 'interface' | 'game' | 'controls' | 'about';

const TABS: { id: Tab; name: string; icon: string }[] = [
  { id: 'sound', name: 'Sound', icon: 'sound' },
  { id: 'graphics', name: 'Graphics', icon: 'display' },
  { id: 'interface', name: 'Interface', icon: 'sliders' },
  { id: 'game', name: 'Game and saves', icon: 'save' },
  { id: 'controls', name: 'Controls', icon: 'keyboard' },
  { id: 'about', name: 'About', icon: 'help' },
];

const VOLUMES: [keyof Omit<AudioSettings, 'muted'>, string, string][] = [
  ['master', 'Master volume', 'Everything at once.'],
  ['music', 'Music', 'The score, which changes with your era and your civilization.'],
  ['effects', 'Effects', 'Clicks, footsteps, combat, fanfares.'],
  ['ambience', 'Ambience', 'Wind, birds and the sounds of your settlements.'],
];

/**
 * Options (docs/06-ui-ux.md, "Options"): sound, graphics, interface, saving and controls, from the
 * title screen and from the game's menu. Everything applies at once and is kept in this browser.
 */
export function OptionsScreen({ onClose, initial }: { onClose: () => void; initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial ?? 'sound');
  return (
    <MenuScreen title="Options" icon="settings" onClose={onClose} className="mx-options-screen">
      <div className="mx-options">
        <nav className="mx-nav" aria-label="Option groups">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'on' : ''}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={20} />
              {t.name}
            </button>
          ))}
        </nav>
        <div className="mx-options-main">
          {tab === 'sound' && <SoundTab />}
          {tab === 'graphics' && <GraphicsTab />}
          {tab === 'interface' && <InterfaceTab />}
          {tab === 'game' && <GameTab />}
          {tab === 'controls' && <ControlsTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </MenuScreen>
  );
}

function SoundTab() {
  const [s, setS] = useState<AudioSettings>(audio.settings);
  const settings = useSettings();
  const set = (patch: Partial<AudioSettings>) => {
    audio.start();
    music.start();
    audio.set(patch);
    setS({ ...audio.settings });
  };
  return (
    <div className="mx-panel">
      <Section title="Volume">
        {VOLUMES.map(([key, label, hint]) => (
          <Row key={key} label={label} hint={hint}>
            <Slider
              label={label}
              value={Math.round(s[key] * 100)}
              onChange={(n) => set({ [key]: n / 100 })}
              format={(n) => `${n}%`}
            />
          </Row>
        ))}
        <Switch
          label="Mute all sound"
          hint="Silence the game without losing your volume settings."
          checked={s.muted}
          onChange={(muted) => set({ muted })}
        />
        <Switch
          label="Mute when this tab is in the background"
          hint="Sound pauses while you are in another window."
          checked={settings.muteInBackground}
          onChange={(muteInBackground) => setSettings({ muteInBackground })}
        />
        <Switch
          label="Tell me when it's my turn online"
          hint="A browser notification, and a mark on the tab, when your turn comes while you're in another tab."
          checked={settings.turnNotices}
          onChange={(turnNotices) => setSettings({ turnNotices })}
        />
      </Section>
      <Section title="Try it" hint="A few of the game’s sounds, at your current volumes.">
        <div className="mx-options-foot">
          {(
            [
              ['click', 'Click'],
              ['found', 'Found a settlement'],
              ['research', 'Research done'],
              ['wonder', 'Wonder'],
            ] as const
          ).map(([cue, label]) => (
            <button
              key={cue}
              type="button"
              onClick={() => {
                audio.start();
                play(cue);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function GraphicsTab() {
  const settings = useSettings();
  const webgl = hasWebGL2();
  const [full, setFull] = useState(isFullscreen);
  return (
    <div className="mx-panel">
      <Section title="Map">
        <Row
          label="Map view"
          hint={
            webgl
              ? '3D is the full painted world; 2D is flat and light on older devices. Switch any time from the game bar.'
              : 'This device can’t run 3D, so the map is 2D.'
          }
        >
          <Choice
            label="Map view"
            value={webgl ? settings.view : '2d'}
            options={[
              { value: '3d', label: '3D' },
              { value: '2d', label: '2D' },
            ]}
            onChange={(view) => webgl && setSettings({ view })}
          />
        </Row>
        <Row
          label="3D quality"
          hint="Low: fewer trees, no glow, sharpness capped. High: richest terrain and effects. Lower it if the frame rate dips."
        >
          <Choice
            label="3D quality"
            value={settings.quality}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
            onChange={(quality) => setSettings({ quality })}
          />
        </Row>
        <Switch
          label="Show frame rate"
          hint="Small counter in the game bar, handy for tuning quality."
          checked={settings.showFps}
          onChange={(showFps) => setSettings({ showFps })}
        />
      </Section>
      <Section title="Window">
        <Switch
          label="Full screen"
          hint="Fill the whole display. Esc leaves it."
          checked={full}
          onChange={() => {
            toggleFullscreen();
            // The browser answers a moment later.
            setTimeout(() => setFull(isFullscreen()), 250);
          }}
        />
        <Switch
          label="Reduce motion"
          hint="Calmer menus: no sliding panels, pulses or banner animations."
          checked={settings.reduceMotion}
          onChange={(reduceMotion) => setSettings({ reduceMotion })}
        />
      </Section>
    </div>
  );
}

function InterfaceTab() {
  const settings = useSettings();
  const [hints, setHintsOn] = useState(hintsOn);
  const [advisors, setAdvisorsOn] = useState(advisorsOn);
  return (
    <div className="mx-panel">
      <Section title="Menus">
        <Switch
          label="Larger menu text"
          hint="Menus, setup and the Civilopedia a step bigger: easier on small or distant screens."
          checked={settings.largeText}
          onChange={(largeText) => setSettings({ largeText })}
        />
        <Switch
          label="Tooltips"
          hint="Hover cards explaining buttons, yields and map things."
          checked={settings.tooltips}
          onChange={(tooltips) => setSettings({ tooltips })}
        />
      </Section>
      <Section title="Help while you play">
        <Switch
          label="First-game hints"
          hint="One short hint at a time while you learn: what to do next. Turning them on starts them over."
          checked={hints}
          onChange={(on) => {
            setHints(on);
            setHintsOn(on);
          }}
        />
        <Switch
          label="Advisor tips"
          hint="A few suggestions each turn from your advisors: idle settlements, an empty research slot…"
          checked={advisors}
          onChange={(on) => {
            setAdvisors(on);
            setAdvisorsOn(on);
          }}
        />
      </Section>
    </div>
  );
}

function GameTab() {
  const settings = useSettings();
  const [cleared, setCleared] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const games = hallOfFame().length;
  return (
    <div className="mx-panel">
      <Section title="Saving">
        <Switch
          label="Autosave every turn"
          hint="A save at the start of each turn, here and to your account when you are signed in. Continue picks the newest."
          checked={settings.autosave}
          onChange={(autosave) => setSettings({ autosave })}
        />
      </Section>
      <Section title="Remembered on this device">
        <Row
          label="Hall of Fame"
          hint={
            games === 0
              ? 'No finished games yet.'
              : `${games} finished game${games === 1 ? '' : 's'} kept here, with replays of the newest.`
          }
        >
          {confirm ? (
            <>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  clearHallOfFame();
                  setConfirm(false);
                  setCleared('Hall of Fame cleared.');
                }}
              >
                Yes, clear it
              </button>
              <button type="button" className="ghost" onClick={() => setConfirm(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" disabled={games === 0} onClick={() => setConfirm(true)}>
              Clear Hall of Fame…
            </button>
          )}
        </Row>
        {cleared && <p className="mx-section-hint">{cleared}</p>}
      </Section>
      <Section title="Defaults">
        <Row label="Reset options" hint="Graphics, interface and saving go back to how they came.">
          <button
            type="button"
            onClick={() => {
              resetSettings();
              setCleared('Options reset.');
            }}
          >
            Reset to defaults
          </button>
        </Row>
      </Section>
    </div>
  );
}

function ControlsTab() {
  return (
    <div className="mx-panel">
      <Section title="Keyboard" hint="Press ? in a game for this list at any time.">
        <dl className="mx-keys">
          {KEYS.map(([k, what]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Mouse and touch">
        <dl className="mx-keys">
          {MOUSE.map(([k, what]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="mx-panel">
      <Section title="Civius Maximus">
        <p>Build an empire to stand the test of time.</p>
        <Row label="Version" hint={BUILD_ID === 'dev' ? 'A development build.' : undefined}>
          <span className="mx-chip">{versionLabel()}</span>
        </Row>
        <Row
          label="Sound and art"
          hint="Everything you hear is synthesized live and everything you see is drawn in code: no sound or image files, nothing copied from another game."
        >
          <span className="mx-chip gold">Made from scratch</span>
        </Row>
      </Section>
    </div>
  );
}
