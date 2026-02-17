import { useMemo, useRef, useCallback } from 'react';
import { IconLayer, ScatterplotLayer, LineLayer, PathLayer } from '@deck.gl/layers';
import type { IFlight, SearchArea, SmartSearchState } from '../types/Flight.types';
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
  predictedAircraft: [255, 60, 60, 255] as [number, number, number, number],
  predictedPath: [255, 60, 60, 160] as [number, number, number, number],
  actualPath: [60, 130, 255, 160] as [number, number, number, number],
  driftLine: [255, 200, 0, 200] as [number, number, number, number],
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
  smartSearch?: SmartSearchState | null;
}

export const useSearchAreaLayers = ({
  searchAreas,
  flights,
  animationClock,
  onFlightClick,
  smartSearch
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
    () => flights.map(f => `${f.flightId}:${f.longitude.toFixed(4)},${f.latitude.toFixed(4)}`).join('|'),
    [flights]
  );

  return useMemo(() => {
    const currentSearchAreas = searchAreasRef.current;
    const currentFlights = flightsRef.current;
    const hasSearchAreas = currentSearchAreas.length > 0;

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

    // ── Smart Search prediction layers ──
    if (smartSearch?.isPredicting && smartSearch.predictedPosition) {
      // Predicted path (red)
      if (smartSearch.predictedPath.length >= 2) {
        layers.push(
          new PathLayer({
            id: 'predicted-path-layer',
            data: [{ path: smartSearch.predictedPath }],
            getPath: (d: { path: [number, number][] }) => d.path,
            getColor: COLORS.predictedPath,
            getWidth: 3,
            widthMinPixels: 2,
            updateTriggers: {
              getPath: smartSearch.predictedPath.length,
            },
          })
        );
      }

      // Actual path (blue)
      if (smartSearch.actualPath.length >= 2) {
        layers.push(
          new PathLayer({
            id: 'actual-path-layer',
            data: [{ path: smartSearch.actualPath }],
            getPath: (d: { path: [number, number][] }) => d.path,
            getColor: COLORS.actualPath,
            getWidth: 3,
            widthMinPixels: 2,
            updateTriggers: {
              getPath: smartSearch.actualPath.length,
            },
          })
        );
      }

      // Drift line (yellow dashed — from actual to predicted)
      if (smartSearch.actualPosition) {
        layers.push(
          new LineLayer({
            id: 'drift-line-layer',
            data: [
              {
                source: [
                  smartSearch.actualPosition.longitude,
                  smartSearch.actualPosition.latitude,
                ],
                target: [
                  smartSearch.predictedPosition.longitude,
                  smartSearch.predictedPosition.latitude,
                ],
              },
            ],
            getSourcePosition: (d: any) => d.source,
            getTargetPosition: (d: any) => d.target,
            getColor: COLORS.driftLine,
            getWidth: 2,
            widthMinPixels: 1,
            updateTriggers: {
              getSourcePosition: `${smartSearch.actualPosition.latitude},${smartSearch.actualPosition.longitude}`,
              getTargetPosition: `${smartSearch.predictedPosition.latitude},${smartSearch.predictedPosition.longitude}`,
            },
          })
        );
      }

      // Predicted aircraft marker (red)
      layers.push(
        new IconLayer({
          id: 'predicted-aircraft-layer',
          data: [
            {
              longitude: smartSearch.predictedPosition.longitude,
              latitude: smartSearch.predictedPosition.latitude,
            },
          ],
          pickable: false,
          iconAtlas: AIRPLANE_ICON_URL,
          iconMapping: ICON_MAPPING,
          getIcon: () => 'airplane',
          getPosition: (d: any) => [d.longitude, d.latitude],
          getSize: 34,
          getColor: COLORS.predictedAircraft,
          getAngle: 0,
          updateTriggers: {
            getPosition: `${smartSearch.predictedPosition.latitude},${smartSearch.predictedPosition.longitude}`,
          },
        })
      );
    }

    return layers;
  }, [searchAreaIds, flightsKey, animationClock, handleClick,
      smartSearch?.isPredicting,
      smartSearch?.predictedPosition?.latitude,
      smartSearch?.predictedPosition?.longitude,
      smartSearch?.predictedPath?.length,
      smartSearch?.actualPath?.length,
      smartSearch?.actualPosition?.latitude,
      smartSearch?.actualPosition?.longitude]);
};
