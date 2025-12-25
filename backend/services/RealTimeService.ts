import { IFlightService, RunMode } from './FlightService.types';
import axios from 'axios';
import { Flight } from '../models/Flight';


export class RealTimeService implements IFlightService {
  readonly mode: RunMode = 'REALTIME';
  private intervalId: NodeJS.Timeout | null = null;

  private readonly ISRAEL_BOUNDS = {
    latMin: 29.5,
    latMax: 33.3,
    lonMin: 34.3,
    lonMax: 35.9
  };

  private readonly API_URL = 'https://opensky-network.org/api/states/all';

  async start(): Promise<void> {
    console.log(`[${this.mode}] Real-time service started. Fetching every 10 seconds.`);
    
    await this.fetchData();

    this.intervalId = setInterval(() => this.fetchData(), 10000);
  }

  private async fetchData(): Promise<void> {
    try {
      const response = await axios.get(this.API_URL, { timeout: 8000 });
      const states = response.data.states || [];

      const israelFlights = states
        .filter((s: any) => {
          const lon = s[5];
          const lat = s[6];
          return lon && lat &&
            lat >= this.ISRAEL_BOUNDS.latMin && lat <= this.ISRAEL_BOUNDS.latMax &&
            lon >= this.ISRAEL_BOUNDS.lonMin && lon <= this.ISRAEL_BOUNDS.lonMax;
        })
        .map((s: any) => ({
          flightId: s[0] || `unknown-${Date.now()}`,
          longitude: s[5],
          latitude: s[6],
          velocity: s[9] || 0,
          trueTrack: s[10] || 0,
        }));

      if (israelFlights.length === 0) {
        console.log(`[${this.mode}] No flights detected in Israeli airspace.`);
        return;
      }

      const bulkOps = israelFlights.map((flight: any) => ({
        updateOne: {
          filter: { flightId: flight.flightId },
          update: {
            $set: {
              longitude: flight.longitude,
              latitude: flight.latitude,
              velocity: flight.velocity,
              trueTrack: flight.trueTrack,
              lastUpdated: new Date()
            },
            $setOnInsert: { color: '#FFDC00' } // Preserve user-defined color
          },
          upsert: true
        }
      }));

      await Flight.bulkWrite(bulkOps);
      console.log(`[${this.mode}] 🔄 Updated ${israelFlights.length} flights at ${new Date().toLocaleTimeString()}`);
      
    } catch (error: any) {
      console.error(`[${this.mode}] ❌ API Error:`, error.message || error);
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`[${this.mode}]  Service stopped. Interval cleared.`);
    }
  }
}