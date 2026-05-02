import { IFlightService, RunMode } from '../services/FlightService.types';
import { IFlightRepository } from '../interfaces/IFlightRepository';
import { RiskManagerService } from '../services/RiskManagerService';
import { OfflineService } from '../services/OfflineService';
import { RealTimeService } from '../services/RealTimeService';
import { SnapService } from '../services/SnapService';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

export class FlightServiceFactory {
  static createService(mode: RunMode, repository: IFlightRepository, riskManager: RiskManagerService): IFlightService {
    logger.info(`Creating service for mode: ${mode}`);

    switch (mode) {
      case 'OFFLINE':
        return new OfflineService(repository);
      
      case 'REALTIME':
        return new RealTimeService(repository, riskManager);
      
      case 'SNAP':
        return new SnapService(repository, riskManager);
      
      default:
        throw new ValidationError(`Invalid service mode: ${mode}`);
    }
  }
}

