import type { PredictionBufferStatus, PredictedPosition } from '../types/Flight.types';

const PREDICTION_API_URL = 'http://localhost:5000/api/predict';

export class PredictionAPIError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'PredictionAPIError';
    this.statusCode = statusCode;
  }
}

export class PredictionService {

  private static async fetchJSON<T>(
    url: string,
    options?: RequestInit
  ): Promise<T> {
    try {
      const response = await fetch(`${PREDICTION_API_URL}${url}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new PredictionAPIError(
          data.error || 'Prediction request failed',
          response.status
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof PredictionAPIError) throw error;
      throw new PredictionAPIError('Prediction server unreachable');
    }
  }

  /** Feed a single observation into the flight's buffer. */
  static async feedObservation(data: {
    flightId: string;
    latitude: number;
    longitude: number;
    altitude: number;
    velocity: number;
    heading: number;
    verticalRate: number;
    timestamp: number;
  }): Promise<PredictionBufferStatus> {
    return this.fetchJSON<PredictionBufferStatus>('/feed', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /** Start the recursive prediction (requires full buffer). */
  static async startPrediction(flightId: string): Promise<{
    started: boolean;
    latitude: number;
    longitude: number;
    altitude: number;
    step: number;
  }> {
    return this.fetchJSON('/start', {
      method: 'POST',
      body: JSON.stringify({ flightId }),
    });
  }

  /** Get the next recursive prediction step. */
  static async predictStep(flightId: string): Promise<PredictedPosition> {
    return this.fetchJSON<PredictedPosition>('/step', {
      method: 'POST',
      body: JSON.stringify({ flightId }),
    });
  }

  /** Stop the recursive prediction loop. */
  static async stopPrediction(
    flightId: string
  ): Promise<{ stopped: boolean; totalSteps: number }> {
    return this.fetchJSON('/stop', {
      method: 'POST',
      body: JSON.stringify({ flightId }),
    });
  }

  /** Get current buffer / prediction status. */
  static async getStatus(flightId: string): Promise<{
    flightId: string;
    bufferSize: number;
    bufferReady: boolean;
    isPredicting: boolean;
    predictionStep: number;
    samplesNeeded: number;
  }> {
    return this.fetchJSON(`/status/${encodeURIComponent(flightId)}`);
  }

  /** Reset (clear) all state for a flight. */
  static async resetBuffer(flightId: string): Promise<void> {
    await this.fetchJSON(`/reset/${encodeURIComponent(flightId)}`, {
      method: 'DELETE',
    });
  }

  /** Quick health check of the prediction server. */
  static async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${PREDICTION_API_URL.replace('/api/predict', '')}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
