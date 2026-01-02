

  import { RunMode } from './FlightService.types';
  import { BaseFlightService } from './BaseFlightService';
  import { IFlightRepository } from '../interfaces/IFlightRepository';
  import { FlightDTO } from '../models/Flight.types';
  import { logger } from '../utils/logger';
  import { ExternalServiceError } from '../utils/errors';
  import { validateCoordinates } from '../utils/validators';
  import axios, { AxiosError } from 'axios';


  interface SimulatedFlight {
    flightId: string;
    longitude: number;
    latitude: number;
    velocity: number;
    trueTrack: number;
  }


  export class SnapService extends BaseFlightService {
    private readonly API_URL = 'https://opensky-network.org/api/states/all';
    private readonly API_TIMEOUT_MS = 8000;
    private readonly TIME_STEP_SECONDS = 5;
    private readonly MAX_SNAPSHOT_SIZE = 50;
    private readonly METERS_PER_DEGREE_LAT = 111111;
    private readonly DEFAULT_COLOR = '#FFDC00';

    private simulatedFlights: SimulatedFlight[] = [];

    constructor(repository: IFlightRepository) {
      super(repository, 'SNAP' as RunMode);
    }

    
    protected async initialize(): Promise<void> {
      try {
        await this.takeSnapshot();
      } catch (error) {
        logger.error('Failed to take snapshot, starting with empty state', { error });
      }
      this.startSimulation();
    }

    
    private async takeSnapshot(): Promise<void> {
      logger.info('Taking snapshot from OpenSky API');

      try {
        const response = await axios.get(this.API_URL, {
          timeout: this.API_TIMEOUT_MS,
          headers: { 'Accept': 'application/json' }
        });

        const states = response.data.states || [];
        this.simulatedFlights = this.transformStatesToSimulatedFlights(states);

        logger.info(`Snapshot captured: ${this.simulatedFlights.length} planes ready for simulation`);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          throw new ExternalServiceError(`OpenSky API (${axiosError.response?.status || 'network error'})`);
        }
        throw new ExternalServiceError('OpenSky API', error as Error);
      }
    }

    
    private transformStatesToSimulatedFlights(states: any[]): SimulatedFlight[] {
      return states
        .filter(state => this.isValidState(state))
        .slice(0, this.MAX_SNAPSHOT_SIZE)
        .map(state => ({
          flightId: state[0] || `snap-${Date.now()}-${Math.random()}`,
          longitude: state[5],
          latitude: state[6],
          velocity: state[9],
          trueTrack: state[10]
        }));
    }

    
    private isValidState(state: any[]): boolean {
      return (
        state[5] !== null &&  // longitude
        state[6] !== null &&  // latitude
        state[9] !== null &&  // velocity
        state[10] !== null    // true_track
      );
    }

    
    private startSimulation(): void {
      this.intervalId = setInterval(
        () => this.simulateMovementStep(),
        this.TIME_STEP_SECONDS * 1000
      );

      logger.info(`Simulation started with ${this.TIME_STEP_SECONDS}s time steps`);
    }

    
    private async simulateMovementStep(): Promise<void> {
      if (this.simulatedFlights.length === 0) {
        logger.warn('No flights to simulate');
        return;
      }

      try {
        // Update positions for all flights
        this.simulatedFlights.forEach(flight => {
          this.updateFlightPosition(flight);
        });

        // Save to database
        await this.saveSimulatedFlights();

        logger.info(`Simulation step completed: ${this.simulatedFlights.length} planes moved`);
      } catch (error) {
        logger.error('Simulation step failed', { error });
      }
    }

    
    private updateFlightPosition(flight: SimulatedFlight): void {
      const headingRadians = this.degreesToRadians(flight.trueTrack);
      const distanceMeters = flight.velocity * this.TIME_STEP_SECONDS;

      // Calculate latitude change (North/South movement)
      const deltaLatitude = 
        (distanceMeters * Math.cos(headingRadians)) / this.METERS_PER_DEGREE_LAT;

      // Calculate longitude change (East/West movement)
      // Account for latitude convergence
      const metersPerDegreeLon = 
        this.METERS_PER_DEGREE_LAT * Math.cos(this.degreesToRadians(flight.latitude));
      const deltaLongitude = 
        (distanceMeters * Math.sin(headingRadians)) / metersPerDegreeLon;

      // Update position
      flight.latitude += deltaLatitude;
      flight.longitude += deltaLongitude;

      // Wrap longitude to stay in valid range [-180, 180]
      if (flight.longitude > 180) flight.longitude -= 360;
      if (flight.longitude < -180) flight.longitude += 360;
    }

    
    private degreesToRadians(degrees: number): number {
      return (degrees * Math.PI) / 180;
    }

    
 private async saveSimulatedFlights(): Promise<void> {
    const bulkOps = this.simulatedFlights.flatMap(flight => [
      {
        updateOne: {
          filter: { 
            flightId: flight.flightId,
            isGhost: { $ne: true } 
          },
          update: {
            $set: {
              latitude: flight.latitude,
              longitude: flight.longitude,
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
              latitude: flight.latitude,
              longitude: flight.longitude,
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
      this.simulatedFlights = [];
      try {
        await this.repository.deleteAll();
        logger.info('Snap service cleanup completed (database cleared)');
      } catch (error) {
        logger.error('Failed to cleanup snap service', { error });
      }
    }
  }