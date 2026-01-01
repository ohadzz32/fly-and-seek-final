import type { ViewState, ColorOption } from '../types/Flight.types';

export const INITIAL_VIEW_STATE = {
  longitude: 34.8,
  latitude: 32.1,
  zoom: 7,
  pitch: 0,
  bearing: 0,
};

export const COLOR_OPTIONS: ColorOption[] = [
  { name: 'Red', hex: '#FF4136' },
  { name: 'Blue', hex: '#0074D9' },
  { name: 'Green', hex: '#2ECC40' },
  { name: 'Yellow', hex: '#FFDC00' },
  { name: 'Purple', hex: '#B10DC9' }
];

export const MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const AIRPLANE_ICON_URL = 'https://img.icons8.com/ios-filled/512/FFFFFF/fighter-jet.png';

export const BIRD_ICON_URL = 'https://img.icons8.com/ios-filled/512/FFFFFF/bird.png';
