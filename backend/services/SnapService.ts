import axios from 'axios';
import { RunMode } from './FlightService.types';
import { BaseFlightService } from './BaseFlightService';
import { IFlightRepository } from '../interfaces/IFlightRepository';
import { RiskManagerService } from './RiskManagerService';
import { FlightDTO } from '../models/Flight.types';
import { logger } from '../utils/logger';

const API_URL = 'https://opensky-network.org/api/states/all';
const AUTH_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const SIMULATION_STEP_MS = 12000;
const SNAP_BOUNDS = {
  minLat: 29.0,
  maxLat: 34.0,
  minLon: 33.0,
  maxLon: 36.0
};
const SNAP_MAX_FLIGHTS = 40;
const MOCK_BOUNDS = {
  minLat: 31.0,
  maxLat: 32.5,
  minLon: 34.5,
  maxLon: 35.5
};
const MOCK_COUNT = 15;

export class SnapService extends BaseFlightService {
  private simulatedFlights: FlightDTO[] = [];
  private lastSnapshotAt: number = 0;
  private readonly defaultColor = '#007AFF';

  constructor(repository: IFlightRepository, private riskManager: RiskManagerService) {
    super(repository, 'SNAP' as RunMode);
  }

  protected async initialize(): Promise<void> {
    logger.info('🎬 Initializing Snap simulation...');
    await this.takeSnapshot();
    this.intervalId = setInterval(() => this.moveFlights(), SIMULATION_STEP_MS);
  }

  public async ensureData(): Promise<void> {
    const recentlySeeded = Date.now() - this.lastSnapshotAt < SIMULATION_STEP_MS;
    if (this.simulatedFlights.length > 0 || recentlySeeded) {
      return;
    }

    console.log('[SnapService] ensureData triggered; repopulating snapshot.');
    await this.takeSnapshot();

    if (this.simulatedFlights.length === 0) {
      console.log('[SnapService] Forcing hardcoded SNAP flights (fallback).');
      this.simulatedFlights = this.generateHardcodedSnapFlights();
      await this.syncDb();
    }
  }

  private isInBounds(lat: number, lon: number): boolean {
    return lat >= SNAP_BOUNDS.minLat && lat <= SNAP_BOUNDS.maxLat
      && lon >= SNAP_BOUNDS.minLon && lon <= SNAP_BOUNDS.maxLon;
  }

  private generateMockSnapFlights(): FlightDTO[] {
    const flights: FlightDTO[] = [];
    for (let i = 0; i < MOCK_COUNT; i++) {
      const latitude = MOCK_BOUNDS.minLat + Math.random() * (MOCK_BOUNDS.maxLat - MOCK_BOUNDS.minLat);
      const longitude = MOCK_BOUNDS.minLon + Math.random() * (MOCK_BOUNDS.maxLon - MOCK_BOUNDS.minLon);
      const trueTrack = Math.floor(Math.random() * 360);
      const velocity = 200 + Math.random() * 300;
      const altitude = 1000 + Math.random() * 9000;
      const icao24 = this.generateIcao24();
      const callSign = this.generateCallSign(i + 1);
      flights.push({
        flightId: icao24,
        latitude,
        longitude,
        altitude,
        velocity,
        trueTrack,
        color: this.defaultColor
      });

      console.log(`[SnapService] Mock aircraft ${callSign} (${icao24}) @ ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    }
    return flights;
  }

  private generateHardcodedSnapFlights(): FlightDTO[] {
    const flights: FlightDTO[] = [];
    for (let i = 0; i < 10; i++) {
      const flightId = this.generateIcao24();
      const callSign = this.generateCallSign(i + 1);
      flights.push({
        flightId,
        latitude: 32.0,
        longitude: 34.8,
        altitude: 30000,
        velocity: 400,
        trueTrack: 90,
        color: this.defaultColor
      });
      console.log(`[SnapService] Hardcoded aircraft ${callSign} (${flightId}) @ 32.0, 34.8`);
    }
    return flights;
  }

  private generateIcao24(): string {
    return Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0');
  }

  private generateCallSign(index: number): string {
    return `SNAP${index.toString().padStart(3, '0')}`;
  }

  private async getAccessToken(): Promise<string> {
    const clientId = process.env.OPENSKY_CLIENT_ID;
    const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId || '');
    params.append('client_secret', clientSecret || '');
    params.append('scope', 'openid');

    const res = await axios.post(AUTH_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.data.access_token;
  }

  private async takeSnapshot(): Promise<void> {
    try {
      this.lastSnapshotAt = Date.now();
      const token = await this.getAccessToken();
      const res = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          lamin: SNAP_BOUNDS.minLat,
          lamax: SNAP_BOUNDS.maxLat,
          lomin: SNAP_BOUNDS.minLon,
          lomax: SNAP_BOUNDS.maxLon
        }
      });

      const states = res.data.states || [];
      type SnapMappedFlight = FlightDTO & { onGround: boolean };

      const mappedFlights: SnapMappedFlight[] = states.map((s: any) => ({
        flightId: String(s[0]).toLowerCase(),
        longitude: Number(s[5]),
        latitude: Number(s[6]),
        altitude: s[7] !== null && s[7] !== undefined ? Number(s[7]) : 0,
        velocity: s[9] !== null && s[9] !== undefined ? Number(s[9]) : 200,
        trueTrack: s[10] !== null && s[10] !== undefined ? Number(s[10]) : 0,
        onGround: s[8] === true,
        color: this.defaultColor
      }));

      this.simulatedFlights = mappedFlights
        .filter((f: any) => Number.isFinite(f.longitude) && Number.isFinite(f.latitude))
        .filter((f: any) => this.isInBounds(f.latitude, f.longitude))
        .filter((f: any) => !f.onGround)
        .slice(0, SNAP_MAX_FLIGHTS)
        .map(({ onGround, ...rest }: SnapMappedFlight) => rest);

      if (this.simulatedFlights.length === 0) {
        logger.warn('⚠️ Snap snapshot returned no in-bounds flights. Using mock targets.');
        console.log('[SnapService] Entering MOCK MODE (empty snapshot).');
        this.simulatedFlights = this.generateMockSnapFlights();
      }

      if (this.simulatedFlights.length === 0) {
        console.log('[SnapService] Forcing hardcoded SNAP flights (post-mock).');
        this.simulatedFlights = this.generateHardcodedSnapFlights();
      }

      await this.syncDb();
      logger.info(`📸 Snapshot created with ${this.simulatedFlights.length} flights`);
    } catch (error: any) {
      logger.error('❌ Snap Snapshot failed:', error.message);
      console.log('[SnapService] Entering MOCK MODE (snapshot error).');
      this.lastSnapshotAt = Date.now();
      this.simulatedFlights = this.generateMockSnapFlights();
      await this.syncDb();
    }
  }

  private moveFlights(): void {
    // In a real scenario we'd remove some flights to simulate disappearances
    // For now we just move them
    this.simulatedFlights.forEach(f => {
      const rad = (f.trueTrack * Math.PI) / 180;
      const speed = f.velocity / 100000;
      f.latitude += Math.cos(rad) * speed;
      f.longitude += Math.sin(rad) * speed;
    });
    this.syncDb();
  }

  private async syncDb(): Promise<void> {
    const bulkOps = this.simulatedFlights.map(f => {
      const { color, flightId, ...rest } = f;
      return {
        updateOne: {
          filter: { flightId },
          update: { 
            $set: { ...rest, lastUpdated: new Date() },
            $setOnInsert: { color: color || this.defaultColor }
          },
          upsert: true
        }
      };
    });
    if (bulkOps.length > 0) {
      await this.repository.bulkWrite(bulkOps);
      // Trigger risk management pipeline
      await this.riskManager.processUpdates(this.simulatedFlights);
    }
  }

  protected async cleanup(): Promise<void> {
    this.clearInterval();
    await this.repository.deleteAll();
    this.simulatedFlights = [];
    logger.info('🧹 Snap simulation stopped');
  }
}