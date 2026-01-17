import type { IFlight } from '../types/Flight.types';
import { RunMode } from '../types/enums';

const API_BASE_URL = 'http://localhost:3001/api';

export class APIError extends Error {
  public readonly statusCode: number;

  constructor(
    message: string,
    statusCode: number = 500
  ) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
  }
}

export class FlightAPIService {
  private static async fetchJSON<T>(
    url: string,
    options?: RequestInit
  ): Promise<T> {
    console.log(`[FlightAPIService] 📡 Fetching: ${url}`, options?.method || 'GET');
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers
        }
      });

      const data = await response.json();
      console.log(`[FlightAPIService] ✅ Response from ${url}:`, data);

      if (!response.ok) {
        console.error(`[FlightAPIService] ❌ Error response:`, data);
        throw new APIError(
          data.error?.message || 'Request failed',
          response.status
        );
      }

      return data.data || data;
    } catch (error) {
      console.error(`[FlightAPIService] ❌ Fetch error for ${url}:`, error);
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError('Network error or server unreachable');
    }
  }

  static async getFlights(): Promise<IFlight[]> {
    console.log('[FlightAPIService] 🔍 Getting flights...');
    return this.fetchJSON<IFlight[]>('/flights');
  }

  static async updateFlightColor(
    flightId: string,
    color: string
  ): Promise<IFlight> {
    return this.fetchJSON<IFlight>(`/flights/${flightId}`, {
      method: 'PATCH',
      body: JSON.stringify({ color })
    });
  }

  static async toggleGhostStatus(flightId: string): Promise<void> {
    await this.fetchJSON<{ success: boolean }>(`/flights/${flightId}/toggle-ghost`, {
      method: 'POST'
    });
  }

  static async getCurrentMode(): Promise<RunMode> {
    const response = await this.fetchJSON<{ mode: RunMode }>('/config/mode');
    return response.mode;
  }

  static async changeMode(mode: RunMode): Promise<void> {
    await this.fetchJSON<{ mode: RunMode }>('/config/mode', {
      method: 'POST',
      body: JSON.stringify({ mode })
    });
  }
}
