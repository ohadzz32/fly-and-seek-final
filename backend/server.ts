import express, { Application } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { ServiceManager } from './managers/ServiceManager';
import { configureRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware';
import { logger } from './utils/logger';
import { AppError } from './utils/errors';

dotenv.config();

interface ServerConfig {
  port: number;
  mongoUri: string;
  corsOrigins: string[];
  nodeEnv: string;
}

class FlightTrackingServer {
  private app: Application;
  private serviceManager: ServiceManager;
  private config: ServerConfig;

  constructor() {
    this.app = express();
    this.serviceManager = new ServiceManager();
    this.config = this.loadConfiguration();
  }

  private loadConfiguration(): ServerConfig {
    return {
      port: parseInt(process.env.PORT || '3001', 10),
      mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/fly-and-seek',
      corsOrigins: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000'
      ],
      nodeEnv: process.env.NODE_ENV || 'development'
    };
  }

  private configureMiddleware(): void {
    // CORS configuration
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    logger.info('Middleware configured');
  }

  private configureRoutes(): void {
    // Mount API routes
    this.app.use('/api', configureRoutes(this.serviceManager));

    // 404 handler for undefined routes
    this.app.use(notFoundHandler);

    // Global error handler (must be last)
    this.app.use(errorHandler);

    logger.info('Routes configured');
  }

  private async connectDatabase(): Promise<void> {
    try {
      await mongoose.connect(this.config.mongoUri);
      logger.info('✅ Connected to MongoDB successfully');
    } catch (error) {
      logger.error('❌ MongoDB connection failed', { error });
      throw new AppError('Database connection failed', 500, error as Error);
    }
  }

  private async initializeDefaultService(): Promise<void> {
    try {
      await this.serviceManager.switchService('OFFLINE');
      logger.info('✅ Default service (OFFLINE) initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize default service', { error });
      throw new AppError('Service initialization failed', 500, error as Error);
    }
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.config.port, () => {
        logger.info(`🚀 Server running on http://localhost:${this.config.port}`);
        logger.info(`📊 Environment: ${this.config.nodeEnv}`);
        resolve();
      });
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`\n${signal} received, shutting down gracefully...`);

      try {
        // Stop current service
        this.serviceManager.stopCurrentService();

        // Close database connection
        await mongoose.connection.close();
        logger.info('Database connection closed');

        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  async start(): Promise<void> {
    try {
      logger.info('🚀 Starting Flight Tracking Server...');

      // Configure Express
      this.configureMiddleware();
      this.configureRoutes();

      // Connect to database
      await this.connectDatabase();

      // Initialize default service
      await this.initializeDefaultService();

      // Start HTTP server
      await this.startServer();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      logger.info('✅ Server initialization complete');
    } catch (error) {
      logger.error('❌ Server initialization failed', { error });
      process.exit(1);
    }
  }
}

const server = new FlightTrackingServer();
server.start().catch((error) => {
  logger.error('Fatal error during startup', { error });
  process.exit(1);
});
