import { Request, Response } from 'express';
import { RiskManagerService } from '../services/RiskManagerService';
import { logger } from '../utils/logger';

export class RiskController {
    constructor(private readonly riskManager: RiskManagerService) {}

    async getRiskAssessment(req: Request, res: Response): Promise<void> {
        try {
            logger.info(`[RiskController] Returning live risk map assessment`);
            
            const liveMap = this.riskManager.getGlobalRiskMap();
            
            console.log("SERVICING RAW MAP DATA AT SCALE 0-10");
            res.json(liveMap);
        } catch (error: any) {
            logger.error(`[RiskController] Risk map retrieval failed: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message || 'Internal server error during risk map retrieval'
            });
        }
    }
}

