

import { Request, Response } from 'express';
import { ServiceManager } from '../managers/ServiceManager';
import { RunMode } from '../services/FlightService.types';
import { logger } from '../utils/logger';


export class ConfigController {
  constructor(private readonly serviceManager: ServiceManager) {}

  
  getCurrentMode(req: Request, res: Response): void {
    const currentMode = this.serviceManager.getCurrentMode() || 'OFFLINE';
    
    res.json({
      success: true,
      data: {
        mode: currentMode
      }
    });
  }

  
  async changeMode(req: Request, res: Response): Promise<void> {
    const { mode } = req.body as { mode: RunMode };

    logger.info(`Mode change requested: ${mode}`);

    await this.serviceManager.switchService(mode);

    res.json({
      success: true,
      data: {
        mode,
        message: `Successfully switched to ${mode} mode`
      }
    });
  }
}
