const EARTH_RADIUS_METERS = 6371000;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export const calculateDestinationPoint = (
  startLat: number,
  startLon: number,
  distanceMeters: number,
  bearingDegrees: number
): [number, number] => {
  const δ = distanceMeters / EARTH_RADIUS_METERS;
  const θ = toRadians(bearingDegrees);
  const φ1 = toRadians(startLat);
  const λ1 = toRadians(startLon);

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );

  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );

  return [
    toDegrees(λ2),
    toDegrees(φ2)
  ];
};

export const predictCurrentPosition = (
  lastLat: number,
  lastLon: number,
  speedMs: number,
  heading: number,
  timeElapsedSeconds: number
): [number, number] => {
  const distanceMeters = speedMs * timeElapsedSeconds;
  
  return calculateDestinationPoint(lastLat, lastLon, distanceMeters, heading);
};

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function toDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}
