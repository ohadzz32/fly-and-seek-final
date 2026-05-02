import { IFlightRepository } from '../interfaces/IFlightRepository';
import { FlightRepository } from '../repositories/FlightRepository';
import { FlightServiceFactory } from '../factories/FlightServiceFactory';
import { IFlightService, RunMode } from '../services/FlightService.types';
import { RiskManagerService } from '../services/RiskManagerService';
import { logger } from '../utils/logger';

export class DIContainer {
  private static instance: DIContainer;
  private readonly flightRepository: IFlightRepository;
  private readonly riskManagerService: RiskManagerService;

  private constructor() {
    this.flightRepository = new FlightRepository();
    this.riskManagerService = new RiskManagerService();
    logger.info('DI Container initialized');
  }

  static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
    }
    return DIContainer.instance;
  }

  getFlightRepository(): IFlightRepository {
    return this.flightRepository;
  }

  getRiskManagerService(): RiskManagerService {
    return this.riskManagerService;
  }

  createFlightService(mode: RunMode): IFlightService {
    return FlightServiceFactory.createService(mode, this.flightRepository, this.riskManagerService);
  }
}

