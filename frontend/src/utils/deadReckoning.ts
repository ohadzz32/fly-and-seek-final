/**
 * Utility functions for Dead Reckoning navigation calculations
 * Used to predict aircraft position based on last known velocity and heading
 */

const EARTH_RADIUS_METERS = 6371000;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Calculates a new position based on a starting point, distance, and bearing.
 * using the Haversine destination point formula.
 * 
 * @param startLat Latitude in degrees
 * @param startLon Longitude in degrees
 * @param distanceMeters Distance to travel in meters
 * @param bearingDegrees True track/heading in degrees (0-360)
 * @returns [longitude, latitude]
 */
export const calculateDestinationPoint = (
  startLat: number,
  startLon: number,
  distanceMeters: number,
  bearingDegrees: number
): [number, number] => {
  const δ = distanceMeters / EARTH_RADIUS_METERS; // angular distance in radians
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
    toDegrees(λ2), // longitude
    toDegrees(φ2)  // latitude
  ];
};

/**
 * Predicts current position of an aircraft based on last known data
 * 
 * @param lastLat Last known latitude
 * @param lastLon Last known longitude
 * @param speedMs Speed in meters per second (m/s)
 * @param heading True track in degrees
 * @param timeElapsedSeconds Time since last update in seconds
 * @returns [longitude, latitude]
 */
export const predictCurrentPosition = (
  lastLat: number,
  lastLon: number,
  speedMs: number,
  heading: number,
  timeElapsedSeconds: number
): [number, number] => {
  // Speed is already in m/s, so no conversion needed
  const distanceMeters = speedMs * timeElapsedSeconds;
  
  return calculateDestinationPoint(lastLat, lastLon, distanceMeters, heading);
};

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function toDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}
