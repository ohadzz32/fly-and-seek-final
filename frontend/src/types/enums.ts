export const RunMode = {
  OFFLINE: 'OFFLINE',
  SNAP: 'SNAP',
  REALTIME: 'REALTIME'
} as const;

export type RunMode = typeof RunMode[keyof typeof RunMode];

export const SearchAreaStatus = {
  NONE: 'NONE',
  REGULAR: 'REGULAR',
  SMART: 'SMART'
} as const;

export type SearchAreaStatus = typeof SearchAreaStatus[keyof typeof SearchAreaStatus];

export const LayerIds = {
  BIRD_LAYER: 'bird-layer',
  AIRCRAFT_LAYER: 'live-aircraft-layer',
  FROZEN_AIRCRAFT_LAYER: 'frozen-aircraft-layer',
  SEARCH_RADIUS_LAYER: 'search-radius-layer',
  GHOST_LINE_LAYER: 'ghost-connection-line-layer'
} as const;

export type LayerIds = typeof LayerIds[keyof typeof LayerIds];
