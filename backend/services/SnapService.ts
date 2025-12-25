import { IFlightService, RunMode } from './FlightService.types';
import axios from 'axios';
import { Flight } from '../models/Flight';


export class SnapService implements IFlightService {
  readonly mode: RunMode = 'SNAP';
  private planes: Array<{
    flightId: string;
    longitude: number;
    latitude: number;
    velocity: number; 
    trueTrack: number; 
  }> = [];
  private intervalId: NodeJS.Timeout | null = null;

  private readonly API_URL = 'https://opensky-network.org/api/states/all';
  private readonly TIME_STEP = 5; 
  private readonly METERS_PER_DEGREE = 111111; 

  async start(): Promise<void> {
    console.log(`[${this.mode}]  Taking snapshot from OpenSky API...`);
    
    try {
      const response = await axios.get(this.API_URL, { timeout: 8000 });
      const states = response.data.states || [];

      this.planes = states
        .filter((s: any) => s[5] && s[6] && s[9] !== null && s[10] !== null)
        .slice(0, 50)
        .map((s: any) => ({
          flightId: s[0] || `snap-${Date.now()}-${Math.random()}`,
          longitude: s[5],
          latitude: s[6],
          velocity: s[9], 
          trueTrack: s[10],
        }));

      console.log(`[${this.mode}] 🚀 Snapshot captured: ${this.planes.length} planes. Starting simulation...`);

      // Start simulation loop
      this.intervalId = setInterval(() => this.simulateMovement(), this.TIME_STEP * 1000);
      
    } catch (error: any) {
      console.error(`[${this.mode}]  Error taking snapshot:`, error.message || error);
    }
  }

  private async simulateMovement(): Promise<void> {
    if (this.planes.length === 0) return;

    const bulkOps = this.planes.map((plane) => {
      const headingRad = (plane.trueTrack * Math.PI) / 180;

      const distance = plane.velocity * this.TIME_STEP;

      const deltaLat = (distance * Math.cos(headingRad)) / this.METERS_PER_DEGREE;
      const deltaLon = (distance * Math.sin(headingRad)) / 
        (this.METERS_PER_DEGREE * Math.cos((plane.latitude * Math.PI) / 180));

      plane.latitude += deltaLat;
      plane.longitude += deltaLon;

      return {
        updateOne: {
          filter: { flightId: plane.flightId },
          update: {
            $set: {
              latitude: plane.latitude,
              longitude: plane.longitude,
              velocity: plane.velocity,
              trueTrack: plane.trueTrack,
              lastUpdated: new Date()
            },
            $setOnInsert: { color: '#FFDC00' } 
          },
          upsert: true
        }
      };
    });

    try {
      await Flight.bulkWrite(bulkOps);
      console.log(`[${this.mode}] 🔄 Simulation step: ${this.planes.length} planes moved.`);
    } catch (error) {
      console.error(`[${this.mode}] ❌ DB update error:`, error);
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`[${this.mode}] 🛑 Service stopped. Simulation interval cleared.`);
    }
    this.planes = []; 
  }
}