import { IFlightRepository } from '../interfaces/IFlightRepository';
import { FlightRepository } from '../repositories/FlightRepository';
import { FlightServiceFactory } from '../factories/FlightServiceFactory';
import { IFlightService, RunMode } from '../services/FlightService.types';
import { logger } from '../utils/logger';


export class DIContainer {
  private static instance: DIContainer;
  private readonly flightRepository: IFlightRepository;

  
  private constructor() {
    // Initialize core dependencies
    this.flightRepository = new FlightRepository();
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

  
  createFlightService(mode: RunMode): IFlightService {
    return FlightServiceFactory.createService(mode, this.flightRepository);
  }
}
