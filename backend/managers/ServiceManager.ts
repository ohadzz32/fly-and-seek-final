/**
 * ServiceManager.ts - Service Lifecycle Manager
 * 
 * Manages the active flight service (OFFLINE/REALTIME/SNAP).
 * Handles switching between modes with proper cleanup.
 */

import { IFlightService, RunMode } from '../services/FlightService.types';
import { DIContainer } from '../container/DIContainer';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export class ServiceManager {
  private currentService: IFlightService | null = null;
  private readonly container: DIContainer;

  constructor() {
    this.container = DIContainer.getInstance();
  }

  
  getCurrentMode(): RunMode | null {
    return this.currentService?.mode || null;
  }

  
  getCurrentService(): IFlightService | null {
    return this.currentService;
  }

  
  async switchService(newMode: RunMode): Promise<void> {
    try {
      // Stop current service if running
      if (this.currentService) {
        logger.info(`Stopping ${this.currentService.mode} service`);
        await this.currentService.stop();
        this.currentService = null;
      }

      // Create and start new service
      logger.info(`Switching to ${newMode} mode`);
      this.currentService = this.container.createFlightService(newMode);
      
      await this.currentService.start();
      
      logger.info(`Successfully switched to ${newMode} mode`);
    } catch (error) {
      logger.error(`Failed to switch to ${newMode} mode`, { error });
      this.currentService = null;
      throw new AppError(`Service switch failed: ${newMode}`, 500, error as Error);
    }
  }

  
  stopCurrentService(): void {
    if (this.currentService) {
      logger.info(`Stopping ${this.currentService.mode} service`);
      this.currentService.stop();
      this.currentService = null;
    }
  }
}
