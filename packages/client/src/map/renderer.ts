import type { CompiledContent } from '@cx/content';
import type { MapState } from '@cx/engine';

export type Quality = 'low' | 'medium' | 'high';

export interface MapViewOptions {
  grid: boolean;
  yields: boolean;
  /** `null` = see everything; otherwise only what this player's start can see. */
  viewer: string | null;
  quality: Quality;
}

export interface MapViewData {
  map: MapState;
  content: CompiledContent;
  starts: Record<string, number>;
  playerOrder: string[];
}

/** A unit as the renderer draws it (only units the viewer can see). */
export interface UnitView {
  id: string;
  owner: string;
  /** Index into PLAYER_COLORS. */
  color: number;
  name: string;
  icon: string;
  model: string;
  layer: 'military' | 'civilian' | 'support';
  tile: number;
  mine: boolean;
  needsOrders: boolean;
}

/** A planned move: each step, which turn it's reached on, and whether a turn ends there. */
export interface PathView {
  steps: { tile: number; turn: number; endsTurn: boolean }[];
}

/** What the Map Lab and the game screen need from a map renderer, 2D or 3D. */
export interface MapRenderer {
  onHover: (tile: number | undefined) => void;
  /** Left click / tap. */
  onSelect: (tile: number | undefined) => void;
  /** Right click (desktop): "move here". */
  onCommand: (tile: number) => void;
  onFps: (fps: number) => void;
  setData(data: MapViewData, options: MapViewOptions): Promise<void>;
  setOptions(options: MapViewOptions): Promise<void>;
  /**
   * Fog from the game (2 visible, 1 explored, 0 unexplored). `null` falls back to the Map Lab's
   * preview fog driven by `options.viewer`.
   */
  setFog(fog: Uint8Array | null): void;
  /** Units to draw; `moves` animates units along the paths they just took. */
  setUnits(units: UnitView[], moves?: { unit: string; path: number[] }[]): void;
  setSelected(unit: string | null): void;
  /** `from` is the tile the selected unit stands on. */
  setPath(path: PathView | null, from: number | null): void;
  focusPlayer(player: string | undefined): void;
  /** Pans to a tile, zooming in only if the camera is too far out to see units; `close` zooms in
   * for a good look (used at the start of a game). */
  focusTile(tile: number, close?: boolean): void;
  destroy(): void;
}

export const PLAYER_COLORS = [
  0xe0b040, 0x4aa3df, 0xd9534f, 0x5cb85c, 0xb07cd8, 0xf08a3c, 0x41c7b9, 0xe46fae, 0x8d9db6,
  0xc9d65a, 0x7f6fd6, 0xd98f8f, 0x6ea86e, 0xc4a484, 0x5b8fb0, 0xbfbfbf,
];

/** Which tiles a player sees at turn 1 in the fog preview: 2 = visible, 1 = remembered, 0 = unexplored. */
export function previewVisibility(
  data: MapViewData,
  viewer: string | null,
  within: (center: number, radius: number) => number[],
): Uint8Array {
  const vis = new Uint8Array(data.map.tiles.length);
  if (viewer === null || data.starts[viewer] === undefined) return vis.fill(2);
  for (const t of within(data.starts[viewer]!, 6)) vis[t] = 1;
  for (const t of within(data.starts[viewer]!, 3)) vis[t] = 2;
  return vis;
}
