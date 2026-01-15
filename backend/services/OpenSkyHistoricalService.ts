import { Server as SocketServer } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { IFlight } from '../models/Flight.types';

interface OpenSkyState {
  time: number;
  states: Array<Array<string | number | boolean | null>>;
}

/**
 * Service for streaming historical OpenSky data
 * Maps OpenSky state array format to IFlight interface
 */
export class OpenSkyHistoricalService {
  private io: SocketServer;
  private dataPath: string;
  private streamInterval: NodeJS.Timeout | null = null;
  private animationInterval: NodeJS.Timeout | null = null;
  private currentBatchIndex = 0;
  private allStates: any[] = []; // Can be array of arrays OR array of objects
  private activeFlights: Map<string, any> = new Map(); // Track active flights for animation
  private readonly BATCH_SIZE = 400;
  private readonly UPDATE_INTERVAL = 5000; // 5 seconds - slower batch loading
  private readonly ANIMATION_INTERVAL = 500; // 500ms for smooth movement (2 FPS)
  private readonly MAX_FLIGHTS_TO_SEND = 1500; // Reduced from 3000
  
  // Israel airspace boundaries
  private readonly ISRAEL_BOUNDS = {
    minLon: 34.2,
    maxLon: 35.9,
    minLat: 29.5,
    maxLat: 33.3
  };

  constructor(io: SocketServer) {
    this.io = io;
    this.dataPath = path.join(__dirname, '../datasetforflight/states_2017-06-05-01.json');
  }

  /**
   * Load the historical dataset into memory
   * Note: This file is large (~450MB) - only load it once at startup
   */
  public async loadDataset(): Promise<void> {
    try {
      logger.info('🔄 Loading OpenSky historical dataset...');
      
      if (!fs.existsSync(this.dataPath)) {
        logger.error(`❌ Dataset file not found at: ${this.dataPath}`);
        throw new Error('Historical dataset file not found');
      }

      const fileContent = fs.readFileSync(this.dataPath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      // Check if data is an array of objects (actual format)
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        // Load ALL worldwide flights (no filtering)
        this.allStates = data
          .filter((obj: any) => obj.lat != null && obj.lon != null);
        
        logger.info(`✅ Loaded ${this.allStates.length} aircraft states from historical dataset (object format)`);
        
        // Add synthetic Israeli traffic to ensure coverage
        logger.info('✈️ Adding synthetic Israeli flights to ensure regional coverage');
        this.generateSyntheticIsraeliTraffic();
        
      } else if (data.states && Array.isArray(data.states)) {
        // Old format: {time, states: [[...]]}
        this.allStates = data.states.filter((state: any) => {
          const lon = state[5];
          const lat = state[6];
          return lon != null && lat != null;
        });
        logger.info(`✅ Loaded ${this.allStates.length} aircraft states from historical dataset (array format)`);
        this.generateSyntheticIsraeliTraffic();
      } else {
        throw new Error('Dataset format not recognized');
      }
      
      logger.info(`📊 Total aircraft in dataset: ${this.allStates.length}`);
    } catch (error) {
      logger.error('❌ Failed to load historical dataset', { error });
      throw error;
    }
  }

  /**
   * Generate synthetic Israeli airspace traffic for realistic visualization
   * Creates flights on common routes and patterns
   */
  private generateSyntheticIsraeliTraffic(): void {
    const syntheticFlights: any[] = [];
    const baseTime = Date.now() / 1000;

    // Common Israeli airports coordinates
    const airports = {
      TLV: { lat: 32.0114, lon: 34.8867, name: 'Tel Aviv Ben Gurion' }, // Ben Gurion
      SDV: { lat: 29.5617, lon: 34.9508, name: 'Sde Dov' }, // Sde Dov
      ETH: { lat: 29.5614, lon: 34.9609, name: 'Eilat' }, // Eilat
      HFA: { lat: 32.8094, lon: 35.0433, name: 'Haifa' }, // Haifa
      HA: { lat: 31.8667, lon: 35.2200, name: 'Atarot Jerusalem' } // Jerusalem (closed but for reference)
    };

    // Generate flights around major airports and routes
    const flightPatterns = [
      // International arrivals approaching TLV from different directions
      { lat: 32.5, lon: 34.5, heading: 135, velocity: 450, callsign: 'ELY001', alt: 35000 },
      { lat: 32.3, lon: 35.2, heading: 270, velocity: 420, callsign: 'UAL954', alt: 33000 },
      { lat: 31.7, lon: 35.0, heading: 0, velocity: 480, callsign: 'BAW165', alt: 37000 },
      { lat: 32.2, lon: 34.7, heading: 90, velocity: 400, callsign: 'AFR634', alt: 31000 },
      
      // Departures from TLV climbing out
      { lat: 32.1, lon: 34.9, heading: 315, velocity: 380, callsign: 'ELY315', alt: 15000 },
      { lat: 31.9, lon: 34.8, heading: 225, velocity: 420, callsign: 'THY794', alt: 22000 },
      { lat: 32.0, lon: 35.1, heading: 45, velocity: 350, callsign: 'AUA857', alt: 12000 },
      
      // Domestic flights
      { lat: 30.8, lon: 34.9, heading: 180, velocity: 280, callsign: 'ARK101', alt: 18000 }, // TLV-Eilat
      { lat: 31.5, lon: 34.85, heading: 0, velocity: 260, callsign: 'ARK102', alt: 16000 }, // Eilat-TLV
      { lat: 32.4, lon: 34.95, heading: 270, velocity: 240, callsign: 'SWN201', alt: 14000 }, // Haifa area
      
      // Overflights (passing through Israeli airspace)
      { lat: 30.2, lon: 35.5, heading: 315, velocity: 520, callsign: 'UAE231', alt: 39000 },
      { lat: 33.1, lon: 35.3, heading: 180, velocity: 510, callsign: 'KLM445', alt: 38000 },
      { lat: 31.0, lon: 34.4, heading: 45, velocity: 490, callsign: 'SWR296', alt: 36000 },
      
      // Training and GA traffic (lower, slower)
      { lat: 32.05, lon: 34.92, heading: 90, velocity: 120, callsign: 'IAC88', alt: 3500 },
      { lat: 32.0, lon: 34.88, heading: 180, velocity: 110, callsign: 'IAC76', alt: 2800 },
      { lat: 32.15, lon: 34.85, heading: 270, velocity: 130, callsign: 'FDX5432', alt: 4000 },
    ];

    // Generate multiple instances of each pattern with slight variations
    let icaoCounter = 40000;
    for (let i = 0; i < 3; i++) { // 3 iterations = 48 flights (instead of 5)
      flightPatterns.forEach((pattern, idx) => {
        const variation = (Math.random() - 0.5) * 0.15; // ±0.075° variation
        syntheticFlights.push({
          time: baseTime,
          icao24: `syn${icaoCounter.toString(16)}`,
          callsign: `${pattern.callsign}${i > 0 ? i : ''}`,
          lat: pattern.lat + variation,
          lon: pattern.lon + variation,
          velocity: pattern.velocity + (Math.random() - 0.5) * 40, // ±20 knots
          heading: (pattern.heading + (Math.random() - 0.5) * 15) % 360, // ±7.5°
          vertical_rate: Math.random() > 0.7 ? (Math.random() - 0.5) * 10 : 0,
          on_ground: false,
          baro_altitude: pattern.alt + (Math.random() - 0.5) * 2000
        });
        icaoCounter++;
      });
    }

    // Add scattered additional traffic
    for (let i = 0; i < 10; i++) { // Reduced from 20 to 10
      const lat = this.ISRAEL_BOUNDS.minLat + Math.random() * (this.ISRAEL_BOUNDS.maxLat - this.ISRAEL_BOUNDS.minLat);
      const lon = this.ISRAEL_BOUNDS.minLon + Math.random() * (this.ISRAEL_BOUNDS.maxLon - this.ISRAEL_BOUNDS.minLon);
      
      syntheticFlights.push({
        time: baseTime,
        icao24: `rnd${icaoCounter.toString(16)}`,
        callsign: `FLT${Math.floor(Math.random() * 9999)}`,
        lat,
        lon,
        velocity: 200 + Math.random() * 400,
        heading: Math.random() * 360,
        vertical_rate: (Math.random() - 0.5) * 15,
        on_ground: false,
        baro_altitude: 10000 + Math.random() * 30000
      });
      icaoCounter++;
    }

    this.allStates.push(...syntheticFlights);
    logger.info(`✈️ Generated ${syntheticFlights.length} synthetic Israeli flights`);
    logger.info(`📊 Total dataset now: ${this.allStates.length} flights`);
  }

  /**
   * Map OpenSky state array OR object to IFlight interface
   * Handles both formats:
   * 1. Array format: [icao24, callsign, origin_country, ...]
   * 2. Object format: {icao24, callsign, lat, lon, ...}
   */
  private mapStateToFlight(state: any): IFlight | null {
    try {
      let icao24: string;
      let callsign: string;
      let longitude: number;
      let latitude: number;
      let velocity: number;
      let trueTrack: number;

      // Check if state is an object (new format)
      if (typeof state === 'object' && !Array.isArray(state)) {
        icao24 = state.icao24;
        callsign = state.callsign?.trim() || icao24;
        longitude = state.lon;
        latitude = state.lat;
        velocity = state.velocity || 0;
        trueTrack = state.heading || 0;
      } else if (Array.isArray(state)) {
        // Array format (old format)
        icao24 = state[0] as string;
        callsign = (state[1] as string)?.trim() || icao24;
        longitude = state[5] as number;
        latitude = state[6] as number;
        velocity = state[9] as number;
        trueTrack = state[10] as number;
      } else {
        return null;
      }

      // Validate required fields
      if (!icao24 || longitude == null || latitude == null) {
        return null;
      }

      const flight: IFlight = {
        flightId: icao24,
        callsign,
        latitude,
        longitude,
        velocity: velocity || 0,
        trueTrack: trueTrack || 0,
        color: '#FFD700', // Default gold color
        isGhost: false,
        lastUpdated: new Date()
      };

      return flight;
    } catch (error) {
      logger.error('Failed to map state to flight', { error, state });
      return null;
    }
  }

  /**
   * Start streaming data to connected clients
   */
  public startStreaming(): void {
    if (this.streamInterval) {
      logger.warn('Streaming already active');
      return;
    }

    if (this.allStates.length === 0) {
      logger.error('❌ Cannot start streaming: No data loaded');
      return;
    }

    logger.info('🚀 Starting historical data streaming');
    logger.info(`📡 Loading new flights every ${this.UPDATE_INTERVAL}ms when needed`);
    logger.info(`✨ Animating at ${1000 / this.ANIMATION_INTERVAL} FPS (every ${this.ANIMATION_INTERVAL}ms)`);

    this.streamInterval = setInterval(() => {
      this.sendNextBatch();
    }, this.UPDATE_INTERVAL);
    
    // Start animation loop for smooth movement
    this.startAnimation();
  }

  /**
   * Calculate new position based on velocity and heading
   * Uses simple linear interpolation
   */
  private updateFlightPosition(flight: any, deltaTimeSeconds: number): void {
    if (!flight.velocity || !flight.trueTrack) return;
    
    // Convert velocity from knots to meters/second
    const velocityMPS = (flight.velocity * 1852) / 3600; // 1 knot = 1852 meters/hour
    
    // Convert heading to radians
    const headingRad = (flight.trueTrack * Math.PI) / 180;
    
    // Calculate distance traveled in meters
    const distanceM = velocityMPS * deltaTimeSeconds;
    
    // Convert to degrees (approximate: 1 degree ≈ 111,320 meters at equator)
    const latChange = (distanceM * Math.cos(headingRad)) / 111320;
    const lonChange = (distanceM * Math.sin(headingRad)) / (111320 * Math.cos(flight.latitude * Math.PI / 180));
    
    // Update position
    flight.latitude += latChange;
    flight.longitude += lonChange;
    
    // Wrap longitude to keep in valid range
    if (flight.longitude > 180) flight.longitude -= 360;
    if (flight.longitude < -180) flight.longitude += 360;
    
    // Clamp latitude
    flight.latitude = Math.max(-90, Math.min(90, flight.latitude));
  }

  /**
   * Start animation loop for smooth flight movement
   */
  private startAnimation(): void {
    if (this.animationInterval) return;
    
    let lastUpdate = Date.now();
    
    this.animationInterval = setInterval(() => {
      const now = Date.now();
      const deltaTimeSeconds = (now - lastUpdate) / 1000;
      lastUpdate = now;
      
      if (this.io.sockets.sockets.size === 0) return; // No clients
      
      // Update positions of all active flights
      const updatedFlights: any[] = [];
      this.activeFlights.forEach((flight, flightId) => {
        this.updateFlightPosition(flight, deltaTimeSeconds);
        updatedFlights.push({
          flightId: flight.flightId,
          callsign: flight.callsign,
          latitude: flight.latitude,
          longitude: flight.longitude,
          velocity: flight.velocity,
          trueTrack: flight.trueTrack,
          color: flight.color || '#FFD700',
          isGhost: false,
          lastUpdated: new Date()
        });
      });
      
      // Emit updated positions
      if (updatedFlights.length > 0) {
        this.io.emit('flights_update', updatedFlights);
        if (updatedFlights.length % 500 === 0) { // Log every 500 flights
          logger.debug(`✨ Updated ${updatedFlights.length} flight positions`);
        }
      }
    }, this.ANIMATION_INTERVAL);
    
    logger.info(`✨ Started flight animation at ${1000 / this.ANIMATION_INTERVAL} FPS`);
  }

  /**
   * Send next batch of aircraft to clients
   * Only sends new batch if we don't have enough active flights
   */
  private sendNextBatch(): void {
    const connectedClients = this.io.sockets.sockets.size;
    if (connectedClients === 0) {
      logger.debug('No clients connected, skipping batch send');
      return;
    }

    // Only load new flights if we're below threshold
    if (this.activeFlights.size >= this.MAX_FLIGHTS_TO_SEND * 0.8) {
      logger.debug(`Enough active flights (${this.activeFlights.size}), skipping batch load`);
      return;
    }

    // Get next batch
    const startIndex = this.currentBatchIndex;
    const endIndex = Math.min(startIndex + this.BATCH_SIZE, this.allStates.length);
    
    const batchStates = this.allStates.slice(startIndex, endIndex);
    
    // Map to flights and filter out invalid ones
    const flights = batchStates
      .map(state => this.mapStateToFlight(state))
      .filter((flight): flight is IFlight => flight !== null);

    if (flights.length > 0) {
      // Add new flights to active tracking (but don't emit them here)
      flights.forEach(flight => {
        if (!this.activeFlights.has(flight.flightId)) {
          this.activeFlights.set(flight.flightId, { ...flight });
        }
      });
      
      // Limit active flights
      if (this.activeFlights.size > this.MAX_FLIGHTS_TO_SEND) {
        const toRemove = this.activeFlights.size - this.MAX_FLIGHTS_TO_SEND;
        const keysToRemove = Array.from(this.activeFlights.keys()).slice(0, toRemove);
        keysToRemove.forEach(key => this.activeFlights.delete(key));
      }
      
      logger.info(`📦 Loaded batch of ${flights.length} flights [Index: ${startIndex}-${endIndex}] [Active: ${this.activeFlights.size}]`);
    }

    // Move to next batch
    this.currentBatchIndex = endIndex >= this.allStates.length ? 0 : endIndex;
    
    if (this.currentBatchIndex === 0 && endIndex >= this.allStates.length) {
      logger.info('🔄 Completed full dataset cycle');
    }
  }

  /**
   * Stop streaming data
   */
  public stopStreaming(): void {
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
      logger.info('⏹️ Stopped historical data streaming');
    }
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
      logger.info('⏹️ Stopped flight animation');
    }
    this.activeFlights.clear();
  }

  /**
   * Get statistics about the loaded dataset
   */
  public getStats() {
    return {
      totalAircraft: this.allStates.length,
      currentBatchIndex: this.currentBatchIndex,
      batchSize: this.BATCH_SIZE,
      updateInterval: this.UPDATE_INTERVAL,
      isStreaming: this.streamInterval !== null,
      connectedClients: this.io.sockets.sockets.size
    };
  }
}
