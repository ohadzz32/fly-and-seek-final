/**
 * OfflineService.ts - Static Bird Data Display
 * 
 * Loads bird observation data from a local GeoJSON file.
 * Used for offline mode when no live flight data is needed.
 */

import { RunMode } from './FlightService.types';
import { BaseFlightService } from './BaseFlightService';
import { IFlightRepository } from '../interfaces/IFlightRepository';
import { FlightDTO } from '../models/Flight.types';
import { logger } from '../utils/logger';
import { AppError, ValidationError } from '../utils/errors';
import { validateCoordinates } from '../utils/validators';
import fs from 'fs/promises';
import path from 'path';

// GeoJSON type definitions
interface GeoJSONFeature {
  type: string;
  properties?: { id?: string };
  geometry: {
    type: string;
    coordinates: [number, number];
  };
}

interface GeoJSONData {
  type: string;
  features: GeoJSONFeature[];
}


export class OfflineService extends BaseFlightService {
  private readonly DATA_FILE_PATH: string;
  private readonly DEFAULT_COLOR = '#FFDC00';

  constructor(repository: IFlightRepository) {
    super(repository, 'OFFLINE' as RunMode);
    this.DATA_FILE_PATH = path.join(process.cwd(), 'data', 'bird_data (1).geojson');
  }

  
  protected async initialize(): Promise<void> {
    try {
      const birds = await this.loadBirdDataFromFile();
      await this.saveBirdsToDatabase(birds);
      logger.info(`Loaded ${birds.length} birds from GeoJSON file`);
    } catch (error) {
      throw new AppError('Failed to load offline bird data', 500, error as Error);
    }
  }

  
  private async loadBirdDataFromFile(): Promise<FlightDTO[]> {
    try {
      const rawData = await fs.readFile(this.DATA_FILE_PATH, 'utf-8');
      const geoJson: GeoJSONData = JSON.parse(rawData);

      if (!geoJson.features || !Array.isArray(geoJson.features)) {
        throw new ValidationError('Invalid GeoJSON structure: missing features array');
      }

      return geoJson.features.map((feature, index) => this.transformFeatureToFlight(feature, index));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppError(`Data file not found: ${this.DATA_FILE_PATH}`, 404);
      }
      throw error;
    }
  }

  
  private transformFeatureToFlight(feature: GeoJSONFeature, index: number): FlightDTO {
    const [longitude, latitude] = feature.geometry.coordinates;
    
    // Validate coordinates before creating flight object
    validateCoordinates(latitude, longitude);

    return {
      flightId: feature.properties?.id || `bird-${index}`,
      longitude,
      latitude,
      velocity: 0,
      trueTrack: 0,
      color: this.DEFAULT_COLOR
    };
  }

  
  private async saveBirdsToDatabase(birds: FlightDTO[]): Promise<void> {
    const bulkOps = birds.map(bird => ({
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
          $setOnInsert: { color: bird.color }
        },
        upsert: true
      }
    }));

    await this.repository.bulkWrite(bulkOps);
  }

  
  protected async cleanup(): Promise<void> {
    try {
      await this.repository.deleteAll();
      logger.info('Offline service cleanup completed (database cleared)');
    } catch (error) {
      logger.error('Failed to cleanup offline service', { error });
    }
  }
}