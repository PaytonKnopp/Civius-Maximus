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

/** What the Map Lab (and later the game screen) needs from a map renderer, 2D or 3D. */
export interface MapRenderer {
  onHover: (tile: number | undefined) => void;
  onSelect: (tile: number | undefined) => void;
  onFps: (fps: number) => void;
  setData(data: MapViewData, options: MapViewOptions): Promise<void>;
  setOptions(options: MapViewOptions): Promise<void>;
  focusPlayer(player: string | undefined): void;
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
