import axios from 'axios';
import { RunMode } from './FlightService.types';
import { BaseFlightService } from './BaseFlightService';
import { IFlightRepository } from '../interfaces/IFlightRepository';
import { FlightDTO } from '../models/Flight.types';
import { logger } from '../utils/logger';

const API_URL = 'https://opensky-network.org/api/states/all';
const AUTH_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const FETCH_INTERVAL_MS = 15000;

export class RealTimeService extends BaseFlightService {
  constructor(repository: IFlightRepository) {
    super(repository, 'REALTIME' as RunMode);
  }

  protected async initialize(): Promise<void> {
    logger.info('🛰️ Starting REALTIME service with OAuth2...');
    await this.fetchAndStoreFlights();
    this.intervalId = setInterval(() => this.fetchAndStoreFlights(), FETCH_INTERVAL_MS);
  }

  private async getAccessToken(): Promise<string> {
    const clientId = process.env.OPENSKY_CLIENT_ID;
    const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Missing OPENSKY_CLIENT_ID or OPENSKY_CLIENT_SECRET in .env');
    }

    // יצירת הבקשה בדיוק כפי שעבד ב-CURL
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'openid');

    try {
      const res = await axios.post(AUTH_URL, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      return res.data.access_token;
    } catch (error: any) {
      logger.error('❌ OAuth2 Auth Failed:', error.response?.data || error.message);
      throw error;
    }
  }

  private async fetchAndStoreFlights(): Promise<void> {
    try {
      const token = await this.getAccessToken();
      const res = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          lamin: 29.0, lamax: 34.0, // גבולות ישראל
          lomin: 33.0, lomax: 36.0
        },
        timeout: 15000
      });

      const states = res.data.states || [];
      logger.info(`📡 API returned ${states.length} flights near Israel`);

      const flights: FlightDTO[] = states.map((s: any) => ({
        flightId: s[0],
        longitude: s[5],
        latitude: s[6],
        velocity: s[9] || 0,
        trueTrack: s[10] || 0,
        color: '#FF3B30'
      })).filter((f: any) => f.longitude !== null && f.latitude !== null);

      if (flights.length > 0) {
        await this.updateDatabase(flights);
      }
    } catch (error: any) {
      logger.error('❌ RealTime fetch failed:', error.message);
    }
  }

  private async updateDatabase(flights: FlightDTO[]): Promise<void> {
    const bulkOps = flights.map(f => ({
      updateOne: {
        filter: { flightId: f.flightId },
        update: { $set: { ...f, lastUpdated: new Date() } },
        upsert: true
      }
    }));
    await this.repository.bulkWrite(bulkOps);
    logger.info(`✅ Updated ${flights.length} flights in database`);
  }

  protected async cleanup(): Promise<void> {
    this.clearInterval();
    await this.repository.deleteAll();
    logger.info('🧹 RealTime service stopped');
  }
}