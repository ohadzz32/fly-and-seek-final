import axios from 'axios';
import { RunMode } from './FlightService.types';
import { BaseFlightService } from './BaseFlightService';
import { IFlightRepository } from '../interfaces/IFlightRepository';
import { FlightDTO } from '../models/Flight.types';
import { logger } from '../utils/logger';

const API_URL = 'https://opensky-network.org/api/states/all';
const AUTH_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const SIMULATION_STEP_MS = 5000;

export class SnapService extends BaseFlightService {
  private simulatedFlights: FlightDTO[] = [];

  constructor(repository: IFlightRepository) {
    super(repository, 'SNAP' as RunMode);
  }

  protected async initialize(): Promise<void> {
    logger.info('🎬 Initializing Snap simulation...');
    await this.takeSnapshot();
    this.intervalId = setInterval(() => this.moveFlights(), SIMULATION_STEP_MS);
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
      const token = await this.getAccessToken();
      const res = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const states = res.data.states || [];
      // לוקחים 50 מטוסים ראשונים מכל העולם לסימולציה
      this.simulatedFlights = states.slice(0, 50).map((s: any) => ({
        flightId: s[0],
        longitude: s[5],
        latitude: s[6],
        velocity: s[9] || 200,
        trueTrack: s[10] || 0,
        color: '#007AFF'
      })).filter((f: any) => f.longitude !== null);

      await this.syncDb();
      logger.info(`📸 Snapshot created with ${this.simulatedFlights.length} flights`);
    } catch (error: any) {
      logger.error('❌ Snap Snapshot failed:', error.message);
    }
  }

  private moveFlights(): void {
    this.simulatedFlights.forEach(f => {
      const rad = (f.trueTrack * Math.PI) / 180;
      const speed = f.velocity / 100000; // תנועה מדומה איטית
      f.latitude += Math.cos(rad) * speed;
      f.longitude += Math.sin(rad) * speed;
    });
    this.syncDb();
  }

  private async syncDb(): Promise<void> {
    const bulkOps = this.simulatedFlights.map(f => ({
      updateOne: {
        filter: { flightId: f.flightId },
        update: { $set: { ...f, lastUpdated: new Date() } },
        upsert: true
      }
    }));
    if (bulkOps.length > 0) await this.repository.bulkWrite(bulkOps);
  }

  protected async cleanup(): Promise<void> {
    this.clearInterval();
    await this.repository.deleteAll();
    this.simulatedFlights = [];
    logger.info('🧹 Snap simulation stopped');
  }
}