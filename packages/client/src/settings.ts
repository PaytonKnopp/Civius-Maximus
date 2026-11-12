import { useSyncExternalStore } from 'react';
import type { Quality } from './map/renderer';

/**
 * Player settings (the Options screen): graphics, interface and saving, kept in this browser.
 * Sound has its own store (audio/engine.ts) and the first-game hints and advisors theirs
 * (game/hints.ts, game/advisors.ts); the Options screen edits all of them side by side.
 *
 * Settings are cosmetic or per-device: nothing here touches the rules or the saved game.
 */

export interface Settings {
  /** The 3D view's detail. */
  quality: Quality;
  /** The map view a session opens on (the game bar's 3D/2D switch changes it too). */
  view: '3d' | '2d';
  /** Fewer animations on screens, panels and the map's effects. */
  reduceMotion: boolean;
  /** The frame rate in the game bar. */
  showFps: boolean;
  /** The game's own tooltips (hover cards on buttons and map things). */
  tooltips: boolean;
  /** Menu text and controls a step larger (a little more room for touch and small screens). */
  largeText: boolean;
  /** Sound stops while this tab is in the background. */
  muteInBackground: boolean;
  /** A save at the start of every turn (here, and to the account when signed in). */
  autosave: boolean;
  /** Online games: a browser notification when your turn comes while the tab is hidden. */
  turnNotices: boolean;
  /** After a unit is done for the turn, the next one that needs orders is selected (D32). */
  autoCycle: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  view: '3d',
  reduceMotion: false,
  showFps: false,
  tooltips: true,
  largeText: false,
  muteInBackground: true,
  autosave: true,
  turnNotices: true,
  autoCycle: true,
};

const KEY = 'cx.settings';
const QUALITIES: Quality[] = ['low', 'medium', 'high'];

function sanitize(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const bool = (k: keyof Settings) =>
    typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULT_SETTINGS[k] as boolean);
  return {
    quality: QUALITIES.includes(r.quality as Quality)
      ? (r.quality as Quality)
      : DEFAULT_SETTINGS.quality,
    view: r.view === '2d' || r.view === '3d' ? r.view : DEFAULT_SETTINGS.view,
    reduceMotion: bool('reduceMotion'),
    showFps: bool('showFps'),
    tooltips: bool('tooltips'),
    largeText: bool('largeText'),
    muteInBackground: bool('muteInBackground'),
    autosave: bool('autosave'),
    turnNotices: bool('turnNotices'),
    autoCycle: bool('autoCycle'),
  };
}

function load(): Settings {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current: Settings = load();
const listeners = new Set<() => void>();

export const getSettings = () => current;

export function setSettings(patch: Partial<Settings>) {
  current = sanitize({ ...current, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Not remembered after this visit.
  }
  applyToDocument();
  for (const l of listeners) l();
}

export function resetSettings() {
  setSettings({ ...DEFAULT_SETTINGS });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The settings, live: a component re-renders when one changes. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/** Settings that are CSS: a data attribute on the page the stylesheets key off. */
export function applyToDocument() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.motion = current.reduceMotion ? 'reduced' : 'full';
  root.dataset.text = current.largeText ? 'large' : 'normal';
}

/** Sound pauses in a background tab when asked to (docs/06-ui-ux.md, "Music and sound"). */
export function installBackgroundMute(onHidden: (hidden: boolean) => void) {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (getSettings().muteInBackground) onHidden(document.hidden);
  });
}

/** Whether the page is full screen (the browser's own Esc leaves it). */
export const isFullscreen = () => typeof document !== 'undefined' && !!document.fullscreenElement;

export function toggleFullscreen() {
  if (typeof document === 'undefined') return;
  if (document.fullscreenElement) void document.exitFullscreen?.();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

let webgl2: boolean | undefined;

/**
 * Whether the 3D view can run here (otherwise the map is 2D). Asked once: every test makes a
 * WebGL context, and browsers drop the oldest when there are too many (the map's own).
 */
export function hasWebGL2(): boolean {
  if (webgl2 !== undefined) return webgl2;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    webgl2 = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl2 = false;
  }
  return webgl2;
}
