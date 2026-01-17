/**
 * server.ts - Flight Tracking Server
 * 
 * Main entry point for the Fly and Seek backend application.
 * Handles Express configuration, MongoDB connection, and service lifecycle.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Resolve .env path
const envPath = path.resolve(__dirname, '.env');
console.log(`[Server] config path: ${envPath}`);

// 1. Check if file exists
if (fs.existsSync(envPath)) {
  console.log('[Server] .env file exists.');
  const fileContent = fs.readFileSync(envPath, 'utf-8');
  console.log(`[Server] .env content length: ${fileContent.length}`);
  
  // 2. Manual Parse Fallback (to ensure variables are set even if dotenv fails)
  const lines = fileContent.split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const splitIdx = trimmed.indexOf('=');
      if (splitIdx > -1) {
        const key = trimmed.slice(0, splitIdx).trim();
        const val = trimmed.slice(splitIdx + 1).trim();
        if (key && val && !process.env[key]) {
             process.env[key] = val; // Manually set if missing
             console.log(`[Server] Manually loaded env var: ${key}`);
        }
      }
    }
  });
} else {
  console.error('[Server] ❌ .env file NOT FOUND at ' + envPath);
}

// 3. Let dotenv try as well (for standard behavior)
dotenv.config({ path: envPath });

// Environment Variable Check
const openSkyId = process.env.OPENSKY_CLIENT_ID;
if (!openSkyId) {
  console.warn('⚠️  WARNING: OPENSKY_CLIENT_ID is missing/undefined in process.env!');
} else {
  console.log('✅ OPENSKY_CLIENT_ID detected in environment.');
}

import express, { Application } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { ServiceManager } from './managers/ServiceManager';
import { configureRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware';
import { logger } from './utils/logger';
import { AppError } from './utils/errors';


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
        'http://localhost:5175',
        'http://localhost:3000'
      ],
      nodeEnv: process.env.NODE_ENV || 'development'
    };
  }

  private configureMiddleware(): void {
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    logger.info('Middleware configured');
  }

  private configureRoutes(): void {
    this.app.use('/api', configureRoutes(this.serviceManager));

    
    this.app.use(notFoundHandler);

    
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
        this.serviceManager.stopCurrentService();

        
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

      this.configureMiddleware();
      this.configureRoutes();

      await this.connectDatabase();

      await this.initializeDefaultService();

      await this.startServer();

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
