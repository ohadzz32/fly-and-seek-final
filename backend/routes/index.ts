

import { Router } from 'express';
import { FlightController } from '../controllers/FlightController';
import { ConfigController } from '../controllers/ConfigController';
import { ServiceManager } from '../managers/ServiceManager';
import { asyncHandler } from '../middleware/errorMiddleware';
import { 
  validateModeChange, 
  validateColorUpdate, 
  validateFlightIdParam 
} from '../middleware/validationMiddleware';


export function configureRoutes(serviceManager: ServiceManager): Router {
  const router = Router();
  
  // Initialize controllers
  const flightController = new FlightController();
  const configController = new ConfigController(serviceManager);

  // ================== Config Routes ==================
  
  
  router.get(
    '/config/mode',
    (req, res) => configController.getCurrentMode(req, res)
  );

  
  router.post(
    '/config/mode',
    validateModeChange,
    asyncHandler(async (req, res) => configController.changeMode(req, res))
  );

  // ================== Flight Routes ==================

  
  router.get(
    '/flights',
    asyncHandler(async (req, res) => flightController.getAllFlights(req, res))
  );

  
  router.patch(
    '/flights/:id',
    validateFlightIdParam,
    validateColorUpdate,
    asyncHandler(async (req, res) => flightController.updateFlightColor(req, res))
  );

  return router;
}
