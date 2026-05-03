import { useMemo, useRef, useCallback } from 'react';
import { IconLayer, ScatterplotLayer, LineLayer } from '@deck.gl/layers';
import type { IFlight, SearchArea } from '../types/Flight.types';
import { calculateSearchRadius, isFlightTracked } from '../utils/searchAreaUtils';
import { predictCurrentPosition } from '../utils/deadReckoning';
import { hexToRgb } from '../utils/colorUtils';
import { AIRPLANE_ICON_URL } from '../constants/mapConfig';

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
  smartSearchTrackedFlightIds?: string[];
}

export const useSearchAreaLayers = ({
  searchAreas,
  flights,
  animationClock,
  onFlightClick,
  smartSearchTrackedFlightIds = []
}: UseSearchAreaLayersProps) => {
  
  const searchAreasRef = useRef(searchAreas);
  const flightsRef = useRef(flights);
  const onClickRef = useRef(onFlightClick);
  
  searchAreasRef.current = searchAreas;
  flightsRef.current = flights;
  onClickRef.current = onFlightClick;

  const handleClick = useCallback((info: { object?: IFlight }) => {
    if (info.object) {
      onClickRef.current(info.object);
    }
  }, []);

  const searchAreaIds = useMemo(
    () => searchAreas.map(a => a.originalId).join(','),
    [searchAreas]
  );

  const flightsKey = useMemo(
    () => flights.map(f => `${f.flightId}:${f.color}:${f.longitude.toFixed(4)},${f.latitude.toFixed(4)}`).join('|'),
    [flights]
  );

  return useMemo(() => {
    const currentSearchAreas = searchAreasRef.current;
    const currentFlights = flightsRef.current;
    const hasSearchAreas = currentSearchAreas.length > 0;
    const sortedSearchAreas = [...currentSearchAreas].sort((a, b) => {
      const depthA = a.zIndex || 0;
      const depthB = b.zIndex || 0;

      if (depthA !== depthB) {
        return depthA - depthB;
      }

      // Stable tie-breaker keeps render order deterministic when depth is equal.
      return a.originalId.localeCompare(b.originalId);
    });

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
          data: sortedSearchAreas,
          getPosition: (d: SearchArea) => [d.longitude, d.latitude],
          getRadius: (d: SearchArea) => calculateSearchRadius(d, animationClock),
          getFillColor: COLORS.searchAreaFill,
          getLineColor: COLORS.searchAreaStroke,
          stroked: true,
          antialiasing: false,
          parameters: {
            depthTest: false,
            depthMask: false
          } as any,
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
          getAngle: (d: SearchArea) => 90 - (d.trueTrack || 0),
          billboard: false,
          parameters: {
            depthTest: false,
            depthMask: false
          } as any,
          transitions: {
            getPosition: {
              duration: 1000,
              type: 'interpolation'
            },
            getAngle: 2000
          }
        })
      );
    }

    layers.push(
      new IconLayer({
        id: 'live-aircraft-layer',
        data: currentFlights.filter(f => 
          f && typeof f.latitude === 'number' && !isNaN(f.latitude) &&
          typeof f.longitude === 'number' && !isNaN(f.longitude)
        ),
        pickable: true,
        iconAtlas: AIRPLANE_ICON_URL,
        iconMapping: ICON_MAPPING,
        getIcon: () => 'airplane',
        getPosition: (d: IFlight) => [d.longitude, d.latitude],
        getSize: 30,
        getColor: (d: IFlight) => {
          if (smartSearchTrackedFlightIds.includes(d.flightId)) {
            return [160, 160, 160, 255]; // Shadow effect for the real plane
          }
          const isTracked = isFlightTracked(d.flightId, currentSearchAreas);
          return isTracked ? COLORS.ghostTrack : hexToRgb(d.color || '#FF4136');
        },
        getAngle: (d: IFlight) => {
          if (d.trueTrack === undefined || d.trueTrack === null) {
             return 90; 
          }
          return 90 - d.trueTrack;
        },
        billboard: false,
        parameters: {
          depthTest: false,
          depthMask: false
        } as any,
        onClick: handleClick,
        transitions: {
          getPosition: {
            duration: 1000,
            type: 'interpolation'
          },
          getAngle: 2000
        },
        updateTriggers: {
          getColor: [searchAreaIds, flightsKey, smartSearchTrackedFlightIds.join(',')]
        }
      })
    );

    return layers;
  }, [searchAreaIds, flightsKey, animationClock, handleClick, smartSearchTrackedFlightIds.join(',')]);
};
