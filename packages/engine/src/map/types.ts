import type { Elevation } from '@cx/content';
import type { PlayerId } from '../state';

export interface MapTile {
  terrain: string;
  feature: string | null;
  elevation: Elevation;
  resource: string | null;
  /** River edges owned by this tile: bit 0 = E, bit 1 = SW, bit 2 = SE (see hex.ts). */
  river: number;
  owner: PlayerId | null;
}

export interface MapState {
  width: number;
  height: number;
  wrapX: boolean;
  /** Row by row, index = row * width + col. */
  tiles: MapTile[];
}

export interface MapSettings {
  /** A `mapScript` content id. */
  script: string;
  /** A `mapSize` content id. */
  size: string;
  wrapX: boolean;
  resources: 'sparse' | 'standard' | 'abundant';
  startBalance: 'normal' | 'balanced';
}

/** What a player's civ prefers to start near. Each matching tile within 2 adds `weight`. */
export interface StartBias {
  terrain?: string;
  feature?: string;
  elevation?: Elevation;
  coastal?: boolean;
  river?: boolean;
  weight: number;
}
