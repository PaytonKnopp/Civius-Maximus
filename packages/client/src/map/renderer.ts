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
  /** The owner's colors (RGB numbers): main and accent. */
  color: number;
  accent: number;
  name: string;
  icon: string;
  model: string;
  layer: 'military' | 'civilian' | 'support';
  tile: number;
  mine: boolean;
  needsOrders: boolean;
  /** Percent of full health (bars show below 100). */
  health: number;
  /** Has the XP for a promotion (your units only). */
  promotable: boolean;
}

/** A settlement as the renderer draws it (only ones on tiles the viewer has explored). */
export interface SettlementView {
  id: string;
  owner: string;
  color: number;
  accent: number;
  name: string;
  population: number;
  tile: number;
  kind: 'town' | 'city';
  capital: boolean;
  mine: boolean;
  /** Second banner line for your own settlements, e.g. "Warrior · 3". */
  status?: string;
  health: number;
  maxHealth: number;
  /** Outer defense left and full (0 = no walls). */
  walls: number;
  wallsMax: number;
}

/** Territory and improvements, per tile, as the viewer knows them. */
export interface TerritoryView {
  /** The settlement each tile belongs to, or null. Borders are drawn between different owners. */
  settlement: (string | null)[];
  /** Improvement model per tile (see the content's `improvement.model`), or null. */
  improvements: (string | null)[];
  /** District per tile: its model, accent color and short icon, or null. */
  districts: ({ model: string; color: number; icon: string } | null)[];
  /** Wonder per tile: its model and short icon, or null. */
  wonders: ({ model: string; icon: string } | null)[];
  /** Each tile's feature now (woods can be cleared during the game). */
  features: (string | null)[];
  /** Hostile camps on explored tiles. */
  camps: boolean[];
  /** Roads on explored tiles (settlement centers count). */
  roads: boolean[];
}

/** A tile marked for a choice: developing it, buying it... `label` is drawn on the tile. */
export interface TileHighlight {
  tile: number;
  tone: 'develop' | 'buy' | 'worked' | 'selected' | 'place' | 'planned' | 'attack' | 'lens';
  label?: string;
  /** Overrides the tone's color (lenses color tiles by what they show). */
  color?: number;
}

export type FlashTone = 'damage' | 'good' | 'info';

export const FLASH_COLORS: Record<FlashTone, string> = {
  damage: '#ff6b5a',
  good: '#9fd36a',
  info: '#ecdcb4',
};

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
  setSettlements(settlements: SettlementView[], territory: TerritoryView): void;
  setHighlights(highlights: TileHighlight[]): void;
  /** A number or word that rises from a tile and fades (damage taken, "Captured"...). */
  flash(tile: number, text: string, tone: FlashTone): void;
  /** A unit lunges at a tile (melee) or the tile is hit by a shot (ranged). */
  animateAttack(unit: string | null, from: number, tile: number, mode: 'melee' | 'ranged'): void;
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
