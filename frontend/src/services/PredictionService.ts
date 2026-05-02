import { FlightAPIService } from './FlightAPIService';

/**
 * PredictionService — Wrapper around FlightAPIService for prediction operations.
 * This is a compatibility layer for legacy code (usePrediction.ts).
 */
export class PredictionService {
  static async healthCheck(): Promise<boolean> {
    try {
      await FlightAPIService.getCurrentMode();
      return true;
    } catch {
      return false;
    }
  }

  static async feedObservation(_observation: {
    flightId: string;
    latitude: number;
    longitude: number;
    velocity: number;
    heading: number;
    timestamp: number;
  }): Promise<{ bufferSize: number; bufferReady: boolean }> {
    // Placeholder: In a real scenario, this would send obs to server buffer
    return {
      bufferSize: 1,
      bufferReady: false
    };
  }

  static async resetBuffer(_flightId: string): Promise<void> {
    // Placeholder: Reset server-side buffer for a flight
  }

  static async startPrediction(_flightId: string): Promise<any> {
    // Placeholder: Initiate prediction
    return {
      latitude: 0,
      longitude: 0,
      altitude: 0,
      step: 0
    };
  }

  static async predictStep(_flightId: string): Promise<any> {
    // Placeholder: Get next prediction step
    return {
      latitude: 0,
      longitude: 0,
      altitude: 0,
      step: 1
    };
  }

  static async stopPrediction(_flightId: string): Promise<void> {
    // Placeholder: Stop prediction
  }
}
