import { useState } from 'react';
import { audio, type AudioSettings, music } from '../audio';

const SLIDERS: [keyof Omit<AudioSettings, 'muted'>, string][] = [
  ['master', 'Volume'],
  ['music', 'Music'],
  ['effects', 'Effects'],
  ['ambience', 'Ambience'],
];

/** Volume sliders and mute (docs/06-ui-ux.md, "Music and sound"), saved in this browser. */
export function SoundSettings() {
  const [s, setS] = useState<AudioSettings>(audio.settings);
  const set = (patch: Partial<AudioSettings>) => {
    audio.start();
    music.start();
    audio.set(patch);
    setS({ ...audio.settings });
  };
  return (
    <div className="sound-settings" role="group" aria-label="Sound">
      {SLIDERS.map(([key, label]) => (
        <label key={key} className="sound-row">
          <span>{label}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(s[key] * 100)}
            onChange={(e) => set({ [key]: Number(e.target.value) / 100 })}
          />
        </label>
      ))}
      <label className="check">
        <input
          type="checkbox"
          checked={s.muted}
          onChange={(e) => set({ muted: e.target.checked })}
        />
        Mute all sound
      </label>
    </div>
  );
}
