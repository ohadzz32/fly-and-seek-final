import express, { Application } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { ServiceManager } from './managers/ServiceManager';
import { configureRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware';
import { logger } from './utils/logger';
import { AppError } from './utils/errors';
import { OpenSkyHistoricalService } from './services/OpenSkyHistoricalService';

dotenv.config();

interface ServerConfig {
  port: number;
  mongoUri: string;
  corsOrigins: string[];
  nodeEnv: string;
}

class FlightTrackingServer {
  private app: Application;
  private httpServer: import('http').Server;
  private io: SocketServer;
  private serviceManager: ServiceManager;
  private config: ServerConfig;
  private openSkyService: OpenSkyHistoricalService | null = null;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketServer(this.httpServer, {
      cors: {
        origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true
      }
    });
    this.serviceManager = new ServiceManager();
    this.config = this.loadConfiguration();
    this.setupSocketHandlers();
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

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      logger.info(`✅ Client connected: ${socket.id}`);
      logger.info(`📊 Total connected clients: ${this.io.sockets.sockets.size}`);
      
      // Send current stats if available
      if (this.openSkyService) {
        const stats = this.openSkyService.getStats();
        socket.emit('stats', stats);
        logger.info(`📤 Sent stats to ${socket.id}:`, stats);
      }

      socket.on('disconnect', () => {
        logger.info(`❌ Client disconnected: ${socket.id}`);
        logger.info(`📊 Remaining clients: ${this.io.sockets.sockets.size}`);
      });

      socket.on('request_stats', () => {
        if (this.openSkyService) {
          socket.emit('stats', this.openSkyService.getStats());
        }
      });
    });

    logger.info('✅ Socket.io handlers configured');
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
      logger.warn('⚠️ MongoDB connection failed - continuing without database', { error });
      logger.info('💡 Historical data streaming will work without MongoDB');
      // Don't throw - allow server to continue without DB
    }
  }

  private async initializeDefaultService(): Promise<void> {
    try {
      // Skip service initialization if MongoDB is not connected
      if (mongoose.connection.readyState !== 1) {
        logger.info('⏭️ Skipping service initialization (no database connection)');
        return;
      }
      await this.serviceManager.switchService('OFFLINE');
      logger.info('✅ Default service (OFFLINE) initialized');
    } catch (error) {
      logger.warn('⚠️ Failed to initialize default service - continuing', { error });
      // Don't throw - historical streaming doesn't need this
    }
  }

  private async initializeHistoricalDataStreaming(): Promise<void> {
    try {
      this.openSkyService = new OpenSkyHistoricalService(this.io);
      await this.openSkyService.loadDataset();
      this.openSkyService.startStreaming();
      logger.info('✅ Historical data streaming initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize historical data streaming', { error });
      // Don't fail the server if historical data is not available
      logger.warn('⚠️ Server will continue without historical data streaming');
    }
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, () => {
        logger.info(`🚀 Server running on http://localhost:${this.config.port}`);
        logger.info(`📊 Environment: ${this.config.nodeEnv}`);
        logger.info(`🔌 Socket.io enabled for real-time updates`);
        resolve();
      });
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`\n${signal} received, shutting down gracefully...`);

      try {
        // Stop historical data streaming
        if (this.openSkyService) {
          this.openSkyService.stopStreaming();
        }

        // Close Socket.io connections
        this.io.close();
        logger.info('Socket.io connections closed');

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

      // Initialize historical data streaming after server is running
      await this.initializeHistoricalDataStreaming();

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
