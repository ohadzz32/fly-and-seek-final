/**
 * System operation modes
 * Using const objects instead of enums for TypeScript compatibility
 */
export const RunMode = {
  OFFLINE: 'OFFLINE',
  SNAP: 'SNAP',
  REALTIME: 'REALTIME'
} as const;

export type RunMode = typeof RunMode[keyof typeof RunMode];

/**
 * Search area status
 */
export const SearchAreaStatus = {
  NONE: 'NONE',
  REGULAR: 'REGULAR',
  SMART: 'SMART'
} as const;

export type SearchAreaStatus = typeof SearchAreaStatus[keyof typeof SearchAreaStatus];

/**
 * Layer IDs for deck.gl
 */
export const LayerIds = {
  BIRD_LAYER: 'bird-layer',
  AIRCRAFT_LAYER: 'live-aircraft-layer',
  FROZEN_AIRCRAFT_LAYER: 'frozen-aircraft-layer',
  SEARCH_RADIUS_LAYER: 'search-radius-layer',
  GHOST_LINE_LAYER: 'ghost-connection-line-layer'
} as const;

export type LayerIds = typeof LayerIds[keyof typeof LayerIds];
