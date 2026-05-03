import { FlightDTO } from '../models/Flight.types';
import { MachineTwoPredictor } from '../ml/MachineTwoPredictor';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export class RiskManagerService {
    private readonly predictor = new MachineTwoPredictor();
    private readonly recentFlights = new Map<string, FlightDTO>();
    private globalRiskMap: any[] = [];

    constructor() {
        this.loadHistoricData();
    }

    private async loadHistoricData(): Promise<void> {
        try {
            const dataPath = path.resolve(__dirname, '../../frontend/public/map_data.json');
            const fileContent = await fs.readFile(dataPath, 'utf-8');
            if (fileContent.trim()) {
                const data = JSON.parse(fileContent);
                this.globalRiskMap = data.map((item: any) => ({
                    hex: item.hex || item.h3_index,
                    risk: item.risk,
                    label: item.label,
                    color: item.color,
                    details: item.details || {}
                }));
                logger.info(`[RiskManagerService] Initialized with ${this.globalRiskMap.length} historic risk hexes from map_data.json`);
            } else {
                logger.warn(`[RiskManagerService] Historic risk map file is empty at ${dataPath}`);
            }
        } catch (error: any) {
            logger.error(`[RiskManagerService] Failed to load historic risk map:`, error);
        }
    }

    public getGlobalRiskMap(): any[] {
        return this.globalRiskMap;
    }

    public resetTracking(): void {
        logger.info('[RiskManagerService] Resetting tracking state (e.g. for mode switch)');
        this.recentFlights.clear();
        // Persist globalRiskMap instead of clearing it
    }

    public async processUpdates(currentFlights: FlightDTO[]): Promise<void> {
        if (!currentFlights || currentFlights.length === 0) return;

        // Filter out jittery telemetry
        const validCurrentFlights = currentFlights.filter(f => this.isValidTelemetry(f));
        const currentFlightIds = new Set(validCurrentFlights.map(f => f.flightId));
        const disappearedFlights: FlightDTO[] = [];

        if (this.recentFlights.size > 0) {
            for (const [id, flight] of this.recentFlights.entries()) {
                if (!currentFlightIds.has(id)) {
                    disappearedFlights.push(flight);
                    logger.info(`[RiskManagerService] Detected disappearance for flight ${id}`);
                }
            }
        }

        // Update recent flights tracking
        validCurrentFlights.forEach(f => this.recentFlights.set(f.flightId, f));

        // Always trigger assessment to include healthy traffic in the ratio
        await this.triggerRiskAssessment(validCurrentFlights, disappearedFlights);
    }

    private isValidTelemetry(flight: FlightDTO): boolean {
        const prev = this.recentFlights.get(flight.flightId);
        if (!prev) return true;

        // Simple jitter check: max speed ~1200 km/h (333 m/s)
        // Polling is 15s, so max travel is ~5km. We use 15km as a safe buffer for "impossible" jumps.
        const distance = this.calculateDistance(
            prev.latitude, prev.longitude,
            flight.latitude, flight.longitude
        );

        if (distance > 15000) {
            logger.warn(`[RiskManagerService] Jitter detected for ${flight.flightId}: ${Math.round(distance)}m jump. Ignoring frame.`);
            return false;
        }
        return true;
    }

    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    private async triggerRiskAssessment(liveFlights: FlightDTO[], disappearedFlights: FlightDTO[]): Promise<void> {
        try {
            const liveTelemetry = liveFlights.map(f => ({
                icao24: f.flightId,
                lat: f.latitude,
                lon: f.longitude,
                alt: 30000,
                time: Date.now(),
                velocity: f.velocity || 0,
                heading: f.trueTrack || 0,
                status: 1
            }));

            const lostTelemetry = disappearedFlights.map(f => ({
                icao24: f.flightId,
                lat: f.latitude,
                lon: f.longitude,
                alt: 30000,
                time: Date.now(),
                velocity: f.velocity || 0,
                heading: f.trueTrack || 0,
                status: 0
            }));

            const telemetry = [...liveTelemetry, ...lostTelemetry];
            if (telemetry.length === 0) return;

            const rawData = await this.predictor.predict(telemetry);

            const existingHexes = new Map(this.globalRiskMap.map(cell => [cell.hex, cell]));
            
            for (const item of rawData) {
                const hex = item.h3_index;
                const newRisk = (item.risk_score || 0) / 10;
                const newLostSignalCount = item.lost_signal_count || 0;
                const newAircraftCount = item.total_flights || 1;

                if (existingHexes.has(hex)) {
                    const existing = existingHexes.get(hex);
                    // Use weighted average or smoothing instead of Math.max to avoid permanent red
                    existing.risk = (existing.risk * 0.7) + (newRisk * 0.3);
                    
                    if (!existing.details) existing.details = {};
                    existing.details.lost_signal_count = (existing.details.lost_signal_count || 0) + newLostSignalCount;
                    existing.details.aircraft_count = (existing.details.aircraft_count || 0) + newAircraftCount;
                    
                    existing.color = this.getColorForRisk(existing.risk);
                    existing.label = this.getLabelForRisk(existing.risk);
                } else if (newLostSignalCount > 0) {
                    // Only add new hexes if they actually have a lost signal
                    existingHexes.set(hex, {
                        hex: hex,
                        risk: newRisk,
                        label: this.getLabelForRisk(newRisk),
                        color: this.getColorForRisk(newRisk),
                        details: {
                            aircraft_count: newAircraftCount,
                            lost_signal_count: newLostSignalCount,
                            avg_alt: item.avg_alt,
                            confidence: item.confidence_level
                        }
                    });
                }
            }

            this.globalRiskMap = Array.from(existingHexes.values());
            logger.info(`[RiskManagerService] Risk map updated. Total hexes: ${this.globalRiskMap.length}`);

        } catch (error: any) {
            logger.error(`[RiskManagerService] Failed risk assessment:`, error);
        }
    }

    private getColorForRisk(riskScore: number): string {
        if (riskScore >= 7) return '#FF0000'; // High - Red
        if (riskScore >= 4) return '#FF9500'; // Medium - Orange
        return '#FFD700'; // Low - Yellow
    }

    private getLabelForRisk(riskScore: number): string {
        if (riskScore >= 7) return 'High Risk Zone';
        if (riskScore >= 4) return 'Moderate Risk Zone';
        return 'Low Risk Zone';
    }
}
