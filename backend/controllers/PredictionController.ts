import { Request, Response } from 'express';
import { MachineOnePredictor } from '../services/MachineOnePredictor';
import { logger } from '../utils/logger';

export class PredictionController {
    private readonly predictor = new MachineOnePredictor();

    async predictSmartSearch(req: Request, res: Response): Promise<void> {
        const { history } = req.body;

        if (!history || !Array.isArray(history)) {
            res.status(400).json({
                success: false,
                error: 'Valid flight history is required'
            });
            return;
        }

        if (history.length < 30) {
            res.status(400).json({
                success: false,
                error: `Model requires at least 30 historical points, but only ${history.length} were provided.`
            });
            return;
        }

        try {
            logger.info(`[PredictionController] Processing smart-search request for flight with ${history.length} points`);
            const result = await this.predictor.predict(history);
            
            logger.info('[PredictionController] Prediction successful, returning result');
            res.json({
                success: true,
                data: result
            });
        } catch (error: any) {
            logger.error(`[PredictionController] Prediction failed: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message || 'Internal server error during prediction'
            });
        }
    }
}
