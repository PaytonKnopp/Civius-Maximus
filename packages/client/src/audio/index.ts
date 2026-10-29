import { audio } from './engine';
import { music } from './music';
import { play } from './sfx';

export { audio, music, play };
export type { AudioSettings } from './engine';
export type { Sfx } from './sfx';

let installed = false;

/**
 * Starts sound on the first tap or key press (browsers only allow audio after a gesture), and
 * gives every button a soft click.
 */
export function installAudio() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // For the screenshot scripts and the console: window.cxAudio.play('wonder').
  (window as unknown as { cxAudio: unknown }).cxAudio = { audio, music, play };
  const first = () => {
    audio.start();
    music.start();
    window.removeEventListener('pointerdown', first, true);
    window.removeEventListener('keydown', first, true);
  };
  window.addEventListener('pointerdown', first, true);
  window.addEventListener('keydown', first, true);
  window.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, select, summary, [role="tab"]')) play('click');
    },
    true,
  );
}
