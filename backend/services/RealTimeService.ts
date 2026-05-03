import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { RunMode } from './FlightService.types';
import { BaseFlightService } from './BaseFlightService';
import { IFlightRepository } from '../interfaces/IFlightRepository';
import { RiskManagerService } from './RiskManagerService';
import { FlightDTO } from '../models/Flight.types';
import { logger } from '../utils/logger';

const API_URL = 'https://opensky-network.org/api/states/all';
const FETCH_INTERVAL_MS = 12000;
const OPENSKY_USER = 'ohad_battat12-api-client';
const OPENSKY_PASS = 'e3FKWKvPWzUq0tytqnW0IarRqLNpMBcp'; // Placeholder for security

export class RealTimeService extends BaseFlightService {
  public isUsingFallback: boolean = false;
  private fallbackOffsets = new Map<string, { dLat: number, dLon: number }>();
  private lastFallbackRefreshAt = 0;
  private fallbackSelection: string[] = [];
  private readonly fallbackRefreshMs = 5000;
  private readonly fallbackMaxPlanes = 20;

  constructor(repository: IFlightRepository, private riskManager: RiskManagerService) {
    super(repository, 'REALTIME' as RunMode);
  }

  protected async initialize(): Promise<void> {
    logger.info('🛰️ Starting REALTIME service with Basic Auth...');
    await this.fetchAndStoreFlights();
    this.intervalId = setInterval(() => this.fetchAndStoreFlights(), FETCH_INTERVAL_MS);
  }

  private async fetchAndStoreFlights(): Promise<void> {
    const authHeader = `Basic ${Buffer.from(`${OPENSKY_USER}:${OPENSKY_PASS}`).toString('base64')}`;

    try {
      const res = await axios.get(API_URL, {
        headers: { Authorization: authHeader },
        params: {
          lamin: 29.0, lamax: 34.0,
          lomin: 33.0, lomax: 36.0
        },
        timeout: 15000
      });

      this.isUsingFallback = false;
      const states = res.data.states || [];
      const uniqueFlights = new Map<string, any>();

      states.forEach((s: any) => {
        const id = String(s[0]).toLowerCase();
        const lon = Number(s[5]);
        const lat = Number(s[6]);
        const alt = s[7]; // Barometric altitude
        const onGround = s[8]; // Boolean

        // Filter Invalid/Ground Traffic
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        if (onGround === true) return;

        const flight: any = {
          flightId: id,
          longitude: lon,
          latitude: lat,
          velocity: s[9] !== null && s[9] !== undefined ? Number(s[9]) : 0,
          color: '#FF3B30'
        };

        if (s[10] !== null && s[10] !== undefined) {
          flight.trueTrack = Number(s[10]);
        }

        // Keep the latest/first occurrence to deduplicate
        if (!uniqueFlights.has(id)) {
          uniqueFlights.set(id, flight);
        }
      });

      const flights: FlightDTO[] = Array.from(uniqueFlights.values());

      // Cleanup stale data (older than 60s)
      if (this.repository.deleteStaleFlights) {
        await this.repository.deleteStaleFlights(new Date(Date.now() - 60000));
      }

      if (flights.length > 0) {
        await this.updateDatabase(flights);
      }
    } catch {
      this.isUsingFallback = true;
      logger.warn('🛰️ API Offline - Engaging Fallback JSON Engine');
      await this.fetchFromFallback();
    }
  }

  private resolveFallbackPath(): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'frontend', 'public', 'message.txt'),
      path.resolve(process.cwd(), 'frontend', 'public', 'fallback_flights.json'),
      path.resolve(process.cwd(), 'frontend', 'src', 'assets', 'fallback_flights.json'),
      path.resolve(process.cwd(), '..', 'frontend', 'public', 'message.txt'),
      path.resolve(process.cwd(), '..', 'frontend', 'public', 'fallback_flights.json'),
      path.resolve(process.cwd(), '..', 'frontend', 'src', 'assets', 'fallback_flights.json'),
      path.resolve(process.cwd(), 'backend', 'services', 'fallback_flights.json'),
      path.resolve(process.cwd(), '..', 'backend', 'services', 'fallback_flights.json'),
      path.resolve(__dirname, 'fallback_flights.json')
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private async fetchFromFallback(): Promise<void> {
    try {
      const fallbackPath = this.resolveFallbackPath();

      if (!fallbackPath) {
        logger.warn('⚠️ Fallback data file not found. Skipping fallback refresh.');
        return;
      }

      const fileContent = fs.readFileSync(fallbackPath, 'utf8');
      const data = JSON.parse(fileContent);
      const states = data.states || [];

      const now = Date.now();
      const refreshSelection = now - this.lastFallbackRefreshAt >= this.fallbackRefreshMs;

      if (refreshSelection) {
        this.lastFallbackRefreshAt = now;
        const eligibleIds: string[] = [];

        states.forEach((s: any) => {
          const baseLon = Number(s[5]);
          const baseLat = Number(s[6]);

          if (s[6] === null || s[5] === null || !Number.isFinite(baseLat) || !Number.isFinite(baseLon)) return;
          if (baseLat < 29.0 || baseLat > 34.0 || baseLon < 33.0 || baseLon > 36.0) return;

          const id = String(s[0]).toLowerCase();
          eligibleIds.push(id);
        });

        const shuffled = eligibleIds.sort(() => Math.random() - 0.5);
        this.fallbackSelection = shuffled.slice(0, this.fallbackMaxPlanes);
      }

      const flights: FlightDTO[] = [];
      const selection = new Set(this.fallbackSelection);

      states.forEach((s: any) => {
        const id = String(s[0]).toLowerCase();
        const baseLon = Number(s[5]);
        const baseLat = Number(s[6]);
        const velocity = s[9] !== null && s[9] !== undefined ? Number(s[9]) : 200;
        const trueTrack = s[10] !== null ? Number(s[10]) : 0;
        const onGround = s[8];

        if (s[6] === null || s[5] === null || !Number.isFinite(baseLat) || !Number.isFinite(baseLon) || onGround === true) return;
        if (baseLat < 29.0 || baseLat > 34.0 || baseLon < 33.0 || baseLon > 36.0) return;
        if (!selection.has(id)) return;

        // Cumulative Offset Logic for Simulated Movement
        let offsets = this.fallbackOffsets.get(id);
        if (!offsets) {
          offsets = { dLat: 0, dLon: 0 };
        }

        // Add a small randomized displacement based on velocity and heading
        // velocity * 0.0001 provides a visually pleasing step on the map
        const stepSize = velocity * 0.0001; 
        const headingRad = (trueTrack * Math.PI) / 180;
        
        offsets.dLat += Math.cos(headingRad) * stepSize;
        offsets.dLon += Math.sin(headingRad) * stepSize;
        
        this.fallbackOffsets.set(id, offsets);

        flights.push({
          flightId: id,
          longitude: baseLon + offsets.dLon,
          latitude: baseLat + offsets.dLat,
          velocity: velocity,
          trueTrack: trueTrack,
          color: '#FF3B30'
        });
      });

      if (this.repository.deleteStaleFlights) {
        await this.repository.deleteStaleFlights(new Date(Date.now() - 30000));
      }

      logger.info(`📡 RADAR SIMULATOR: Broadcasting ${flights.length} local targets over AOI.`);
      await this.updateDatabase(flights);
      logger.info(`✅ SUCCESS: Database updated with ${flights.length} simulated flights.`);
    } catch (error: any) {
      logger.error(`❌ Failed to read fallback data: ${error?.message || 'Unknown error'}`);
    }
  }

  private async updateDatabase(flights: FlightDTO[]): Promise<void> {
    try {
      if (!flights || flights.length === 0) return;
      const bulkOps = flights.map(f => {
        const { color, flightId, ...rest } = f;
        return {
          updateOne: {
            filter: { flightId },
            update: { 
              $set: { ...rest, lastUpdated: new Date() },
              $setOnInsert: { color: color || '#FF3B30' }
            },
            upsert: true
          }
        };
      });
      await this.repository.bulkWrite(bulkOps);
      logger.info(`✅ Updated ${flights.length} flights in database`);
      
      // Trigger risk management pipeline
      await this.riskManager.processUpdates(flights);
    } catch (error: any) {
      logger.error(`❌ Failed to update database: ${error.message}`);
    }
  }

  protected async cleanup(): Promise<void> {
    this.clearInterval();
    await this.repository.deleteAll();
    logger.info('🧹 RealTime service stopped');
  }
}