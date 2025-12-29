import { IFlightService, RunMode } from './FlightService.types';
import { IFlightRepository } from '../interfaces/IFlightRepository';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export abstract class BaseFlightService implements IFlightService {
  protected intervalId: NodeJS.Timeout | null = null;
  protected isRunning: boolean = false;

  constructor(
    protected readonly repository: IFlightRepository,
    public readonly mode: RunMode
  ) {}

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn(`${this.mode} service is already running`);
      return;
    }

    try {
      logger.info(`Starting ${this.mode} service`);
      await this.onBeforeStart();
      await this.initialize();
      this.isRunning = true;
      logger.info(`${this.mode} service started successfully`);
    } catch (error) {
      logger.error(`Failed to start ${this.mode} service`, { error });
      throw new AppError(`Service startup failed: ${this.mode}`, 500, error as Error);
    }
  }

  stop(): void {
    if (!this.isRunning) {
      logger.warn(`${this.mode} service is not running`);
      return;
    }

    try {
      logger.info(`Stopping ${this.mode} service`);
      this.cleanup();
      this.isRunning = false;
      logger.info(`${this.mode} service stopped successfully`);
    } catch (error) {
      logger.error(`Error stopping ${this.mode} service`, { error });
      throw new AppError(`Service shutdown failed: ${this.mode}`, 500, error as Error);
    }
  }

  protected async onBeforeStart(): Promise<void> {
  }

  protected abstract initialize(): Promise<void>;

  protected abstract cleanup(): void;

  protected clearInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public getStatus(): boolean {
    return this.isRunning;
  }
}
