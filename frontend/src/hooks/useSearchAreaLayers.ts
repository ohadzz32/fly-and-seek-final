import { useMemo, useRef, useCallback } from 'react';
import { IconLayer, ScatterplotLayer, LineLayer } from '@deck.gl/layers';
import type { IFlight, SearchArea } from '../types/Flight.types';
import { calculateSearchRadius, isFlightTracked } from '../utils/searchAreaUtils';
import { predictCurrentPosition } from '../utils/deadReckoning';
import { hexToRgb } from '../utils/colorUtils';
import { AIRPLANE_ICON_URL } from '../constants/mapConfig';

// Layer styling constants
const COLORS = {
  searchAreaFill: [0, 255, 136, 40] as [number, number, number, number],
  searchAreaStroke: [0, 255, 136, 180] as [number, number, number, number],
  frozenAircraft: [255, 255, 0, 255] as [number, number, number, number],
  ghostTrack: [150, 150, 150, 255] as [number, number, number, number],
  connectionLine: [200, 200, 200, 255] as [number, number, number, number],
};

const ICON_MAPPING = {
  airplane: {
    x: 0, y: 0,
    width: 512, height: 512,
    mask: true,
    anchorX: 256, anchorY: 256
  }
};

interface UseSearchAreaLayersProps {
  searchAreas: SearchArea[];
  flights: IFlight[];
  animationClock: number;
  onFlightClick: (flight: IFlight) => void;
}

export const useSearchAreaLayers = ({
  searchAreas,
  flights,
  animationClock,
  onFlightClick
}: UseSearchAreaLayersProps) => {
  
  // Refs prevent callback/data changes from triggering layer recreation
  const searchAreasRef = useRef(searchAreas);
  const flightsRef = useRef(flights);
  const onClickRef = useRef(onFlightClick);
  
  // Update refs silently (doesn't trigger useMemo)
  searchAreasRef.current = searchAreas;
  flightsRef.current = flights;
  onClickRef.current = onFlightClick;

  // Stable click handler using ref
  const handleClick = useCallback((info: { object?: IFlight }) => {
    if (info.object) {
      onClickRef.current(info.object);
    }
  }, []);

  // Stable dependency keys - only change when actual data changes
  const searchAreaIds = useMemo(
    () => searchAreas.map(a => a.originalId).join(','),
    [searchAreas]
  );

  const flightsKey = useMemo(
    () => flights.map(f => `${f.flightId}:${f.longitude.toFixed(4)},${f.latitude.toFixed(4)}`).join('|'),
    [flights]
  );

  // Build layers - only recreates when dependencies change
  return useMemo(() => {
    const currentSearchAreas = searchAreasRef.current;
    const currentFlights = flightsRef.current;
    const hasSearchAreas = currentSearchAreas.length > 0;

    // Helper: Calculate ghost track position using dead reckoning
    const getGhostPosition = (area: SearchArea): [number, number] => {
      const liveFlight = currentFlights.find(f => f.flightId === area.originalId);
      if (liveFlight) {
        return [liveFlight.longitude, liveFlight.latitude];
      }
      const timeElapsed = (animationClock - area.frozenAt) / 1000;
      return predictCurrentPosition(
        area.latitude,
        area.longitude,
        area.velocity || 0,
        area.trueTrack || 0,
        timeElapsed
      );
    };

    const layers = [];

    if (hasSearchAreas) {
      layers.push(
        new ScatterplotLayer({
          id: 'search-radius-layer',
          data: [...currentSearchAreas].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)),
          getPosition: (d: SearchArea) => [d.longitude, d.latitude],
          getRadius: (d: SearchArea) => calculateSearchRadius(d, animationClock),
          getFillColor: COLORS.searchAreaFill,
          getLineColor: COLORS.searchAreaStroke,
          stroked: true,
          lineWidthMinPixels: 2,
          updateTriggers: { getRadius: animationClock }
        })
      );

      layers.push(
        new LineLayer({
          id: 'ghost-connection-line-layer',
          data: currentSearchAreas,
          getSourcePosition: (d: SearchArea) => [d.longitude, d.latitude],
          getTargetPosition: getGhostPosition,
          getColor: COLORS.connectionLine,
          getWidth: 5,
          widthMinPixels: 3,
          updateTriggers: {
            getTargetPosition: `${flightsKey}-${animationClock}`
          }
        })
      );

      layers.push(
        new IconLayer({
          id: 'frozen-aircraft-layer',
          data: currentSearchAreas,
          pickable: true,
          iconAtlas: AIRPLANE_ICON_URL,
          iconMapping: ICON_MAPPING,
          getIcon: () => 'airplane',
          getPosition: (d: SearchArea) => [d.longitude, d.latitude],
          getSize: 30,
          getColor: COLORS.frozenAircraft,
          getAngle: (d: SearchArea) => -(d.trueTrack || 0)
        })
      );
    }

    layers.push(
      new IconLayer({
        id: 'live-aircraft-layer',
        data: currentFlights,
        pickable: true,
        iconAtlas: AIRPLANE_ICON_URL,
        iconMapping: ICON_MAPPING,
        getIcon: () => 'airplane',
        getPosition: (d: IFlight) => [d.longitude, d.latitude],
        getSize: 30,
        getColor: (d: IFlight) => {
          const isTracked = isFlightTracked(d.flightId, currentSearchAreas);
          return isTracked ? COLORS.ghostTrack : hexToRgb(d.color || '#FF4136');
        },
        getAngle: (d: IFlight) => -(d.trueTrack || 0),
        onClick: handleClick,
        transitions: {
          getPosition: 2000,
          getAngle: 500
        },
        updateTriggers: {
          getColor: searchAreaIds
        }
      })
    );

    return layers;
  }, [searchAreaIds, flightsKey, animationClock, handleClick]);
};
