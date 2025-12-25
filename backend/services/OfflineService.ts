import { IFlightService, RunMode } from './FlightService.types';
import fs from 'fs';
import path from 'path';
import { Flight } from '../models/Flight';


export class OfflineService implements IFlightService {
  readonly mode: RunMode = 'OFFLINE';

  async start(): Promise<void> {
    console.log(`[${this.mode}]  Loading local bird data from GeoJSON`);
    
    try {
      const filePath = path.join(process.cwd(), 'data', 'bird_data (1).geojson');
      const rawData = fs.readFileSync(filePath, 'utf-8');
      const geoJson = JSON.parse(rawData);

      const birds = geoJson.features.map((feature: any, index: number) => ({
        flightId: feature.properties?.id || `bird-${index}`,
        longitude: feature.geometry.coordinates[0],
        latitude: feature.geometry.coordinates[1],
        velocity: 0,
        trueTrack: 0,
      }));

      const bulkOps = birds.map((bird: any) => ({
        updateOne: {
          filter: { flightId: bird.flightId },
          update: {
            $set: {
              longitude: bird.longitude,
              latitude: bird.latitude,
              velocity: bird.velocity,
              trueTrack: bird.trueTrack,
              lastUpdated: new Date()
            },
            $setOnInsert: { color: '#FFDC00' } 
          },
          upsert: true
        }
      }));

      await Flight.bulkWrite(bulkOps);
      console.log(`[${this.mode}] ✅ ${birds.length} birds loaded to database.`);
      
    } catch (error) {
      console.error(`[${this.mode}]  Error loading GeoJSON:`, error);
    }
  }

  stop(): void {
    console.log(`[${this.mode}]  Service stopped (no cleanup needed).`);
  }
}