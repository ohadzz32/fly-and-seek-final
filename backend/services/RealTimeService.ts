import { RunMode } from './FlightService.types';
import { BaseFlightService } from './BaseFlightService';
import { IFlightRepository } from '../interfaces/IFlightRepository';
import { GeographicBounds, FlightDTO } from '../models/Flight.types';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';
import { validateCoordinates } from '../utils/validators';
import axios, { AxiosError } from 'axios';


type OpenSkyState = [
  string,  // icao24 (unique identifier)
  string,  // callsign
  string,  // origin_country
  number,  // time_position
  number,  // last_contact
  number,  // longitude
  number,  // latitude
  number,  // baro_altitude
  boolean, // on_ground
  number,  // velocity
  number,  // true_track
  number   // vertical_rate
];

interface OpenSkyResponse {
  time: number;
  states: OpenSkyState[] | null;
}


export class RealTimeService extends BaseFlightService {
  private readonly API_URL = 'https://opensky-network.org/api/states/all';
  private readonly FETCH_INTERVAL_MS = 10000; // 10 seconds
  private readonly API_TIMEOUT_MS = 8000;
  private readonly DEFAULT_COLOR = '#FFDC00';

  private readonly ISRAEL_BOUNDS: GeographicBounds = {
    latMin: 29.5,
    latMax: 33.3,
    lonMin: 34.3,
    lonMax: 35.9
  };

  constructor(repository: IFlightRepository) {
    super(repository, 'REALTIME' as RunMode);
  }

  
  protected async initialize(): Promise<void> {
    // Fetch immediately on start
    await this.fetchAndUpdateFlights();

    // Set up periodic fetching
    this.intervalId = setInterval(
      () => this.fetchAndUpdateFlights(),
      this.FETCH_INTERVAL_MS
    );

    logger.info(`Real-time service initialized, fetching every ${this.FETCH_INTERVAL_MS / 1000}s`);
  }

  
  private async fetchAndUpdateFlights(): Promise<void> {
    try {
      const flights = await this.fetchFlightsFromAPI();
      
      if (flights.length === 0) {
        logger.info('No flights detected in Israeli airspace');
        return;
      }

      await this.updateFlightsInDatabase(flights);
      logger.info(`Updated ${flights.length} flights`, { timestamp: new Date().toISOString() });
    } catch (error) {
      // Log error but don't crash the service - continue trying on next interval
      logger.error('Failed to fetch/update flights', { error });
    }
  }

  
  private async fetchFlightsFromAPI(): Promise<FlightDTO[]> {
    try {
      const response = await axios.get<OpenSkyResponse>(this.API_URL, {
        timeout: this.API_TIMEOUT_MS,
        headers: { 'Accept': 'application/json' }
      });

      const states = response.data.states || [];
      return this.filterAndTransformFlights(states);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.code === 'ECONNABORTED') {
          throw new ExternalServiceError('OpenSky API (timeout)');
        }
        throw new ExternalServiceError(`OpenSky API (${axiosError.response?.status || 'network error'})`);
      }
      throw new ExternalServiceError('OpenSky API', error as Error);
    }
  }

  
  private filterAndTransformFlights(states: OpenSkyState[]): FlightDTO[] {
    return states
      .filter(state => this.isWithinIsraelBounds(state))
      .map(state => this.transformStateToFlight(state));
  }

  
  private isWithinIsraelBounds(state: OpenSkyState): boolean {
    const longitude = state[5];
    const latitude = state[6];

    if (!longitude || !latitude) return false;

    return (
      latitude >= this.ISRAEL_BOUNDS.latMin &&
      latitude <= this.ISRAEL_BOUNDS.latMax &&
      longitude >= this.ISRAEL_BOUNDS.lonMin &&
      longitude <= this.ISRAEL_BOUNDS.lonMax
    );
  }

  
  private transformStateToFlight(state: OpenSkyState): FlightDTO {
    const [icao24, , , , , longitude, latitude, , , velocity, trueTrack] = state;
    
    validateCoordinates(latitude, longitude);

    return {
      flightId: icao24 || `unknown-${Date.now()}`,
      longitude,
      latitude,
      velocity: velocity || 0,
      trueTrack: trueTrack || 0,
      color: this.DEFAULT_COLOR
    };
  }

  
private async updateFlightsInDatabase(flights: FlightDTO[]): Promise<void> {
    const bulkOps = flights.flatMap(flight => [
      {
        updateOne: {
          filter: { 
            flightId: flight.flightId,
            isGhost: { $ne: true } 
          },
          update: {
            $set: {
              longitude: flight.longitude,
              latitude: flight.latitude,
              velocity: flight.velocity,
              trueTrack: flight.trueTrack,
              lastUpdated: new Date()
            },
            $setOnInsert: { color: this.DEFAULT_COLOR }
          },
          upsert: true
        }
      },
      {
        updateOne: {
          filter: { 
            flightId: `${flight.flightId}-shadow`,
            isGhost: false
          },
          update: {
            $set: {
              longitude: flight.longitude,
              latitude: flight.latitude,
              velocity: flight.velocity,
              trueTrack: flight.trueTrack,
              lastUpdated: new Date()
            }
          }
        }
      }
    ]);

    await this.repository.bulkWrite(bulkOps);
  }

  
  protected async cleanup(): Promise<void> {
    this.clearInterval();
    try {
      await this.repository.deleteAll();
      logger.info('Real-time service cleanup completed (database cleared)');
    } catch (error) {
      logger.error('Failed to cleanup real-time service', { error });
    }
  }
}