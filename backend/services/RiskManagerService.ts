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
        } catch (error) {
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

        const currentFlightIds = new Set(currentFlights.map(f => f.flightId));
        const disappearedFlights: FlightDTO[] = [];

        if (this.recentFlights.size > 0) {
            for (const [id, flight] of this.recentFlights.entries()) {
                if (!currentFlightIds.has(id)) {
                    disappearedFlights.push(flight);
                    logger.info(`[RiskManagerService] Detected disappearance for flight ${id}`);
                }
            }
        }

        this.recentFlights.clear();
        for (const f of currentFlights) {
            this.recentFlights.set(f.flightId, f);
        }

        if (disappearedFlights.length > 0) {
            await this.triggerRiskAssessment(disappearedFlights);
        }
    }

    private async triggerRiskAssessment(disappearedFlights: FlightDTO[]): Promise<void> {
        try {
            const telemetry = disappearedFlights.map(f => ({
                icao24: f.flightId,
                lat: f.latitude,
                lon: f.longitude,
                alt: 30000,
                time: Date.now(),
                velocity: f.velocity || 0,
                heading: f.trueTrack || 0,
                status: 0
            }));

            const rawData = await this.predictor.predict(telemetry);

            const existingHexes = new Map(this.globalRiskMap.map(cell => [cell.hex, cell]));
            
            for (const item of rawData) {
                const hex = item.h3_index;
                const newRisk = (item.risk_score || 0) / 10;
                const newLostSignalCount = item.lost_signal_count || 1;
                const newAircraftCount = item.total_flights || 1;

                if (existingHexes.has(hex)) {
                    const existing = existingHexes.get(hex);
                    existing.risk = Math.max(existing.risk, newRisk);
                    existing.details.lost_signal_count = (existing.details.lost_signal_count || 0) + newLostSignalCount;
                    existing.details.aircraft_count = (existing.details.aircraft_count || 0) + newAircraftCount;
                    
                    existing.color = this.getColorForRisk(existing.risk);
                    existing.label = this.getLabelForRisk(existing.risk);
                    
                    existingHexes.set(hex, existing);
                } else {
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

        } catch (error) {
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
