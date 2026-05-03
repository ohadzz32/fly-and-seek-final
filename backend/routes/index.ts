import { Router } from 'express';
import { FlightController } from '../controllers/FlightController';
import { ConfigController } from '../controllers/ConfigController';
import { PredictionController } from '../controllers/PredictionController';
import { RiskController } from '../controllers/RiskController';
import { ServiceManager } from '../managers/ServiceManager';
import { DIContainer } from '../container/DIContainer';
import { asyncHandler } from '../middleware/errorMiddleware';

import { 
  validateModeChange, 
  validateColorUpdate, 
  validateFlightIdParam 
} from '../middleware/validationMiddleware';

export function configureRoutes(serviceManager: ServiceManager): Router {
  const router = Router();
  
  const flightController = new FlightController(serviceManager);
  const configController = new ConfigController(serviceManager);  
  const predictionController = new PredictionController();
  
  const diContainer = DIContainer.getInstance();
  const riskController = new RiskController(diContainer.getRiskManagerService());
  
  console.log('[Routes] Configuring API routes...');

  // Config Routes
  router.get(
    '/config/mode',
    (req, res) => configController.getCurrentMode(req, res)
  );

  router.post(
    '/config/mode',
    validateModeChange,
    asyncHandler(async (req, res) => configController.changeMode(req, res))
  );

  // Prediction Routes
  router.post(
    '/predict/smart-search',
    asyncHandler(async (req, res) => predictionController.predictSmartSearch(req, res))
  );

  // Risk Route
  router.get(
    '/risk/map',
    asyncHandler(async (req, res) => riskController.getRiskAssessment(req, res))
  );

  // Flight History Route (Moved higher to ensure specificity)
  router.get(
    '/flights/:id/history',
    validateFlightIdParam,
    asyncHandler(async (req, res) => {
      console.log(`[Routes] Hit: GET /api/flights/${req.params.id}/history`);
      return flightController.getFlightHistory(req, res);
    })
  );

  // Flight Management Routes
  router.get(
    '/flights',
    asyncHandler(async (req, res) => flightController.getAllFlights(req, res))
  );

  router.post(
    '/flights/:id/toggle-ghost',
    validateFlightIdParam, 
    asyncHandler((req, res) => flightController.toggleGhostStatus(req, res))
  );

  router.patch(
    '/flights/:id',
    validateFlightIdParam,
    validateColorUpdate,
    asyncHandler(async (req, res) => flightController.updateFlightColor(req, res))
  );

  return router;
}
