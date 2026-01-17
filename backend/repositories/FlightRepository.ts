import { Flight } from '../models/Flight';
import { IFlightRepository, BulkWriteOperation } from '../interfaces/IFlightRepository';
import { IFlight } from '../models/Flight.types';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * MongoDB implementation of the flight repository
 * Handles all database operations for flight data
 */
export class FlightRepository implements IFlightRepository {
  /**
   * Retrieve all flights from the database
   */
  async findAll(): Promise<IFlight[]> {
    try {
      const flights = await Flight.find().lean().exec();
      logger.info(`Retrieved ${flights.length} flights from database`);
      return flights as IFlight[];
    } catch (error) {
      logger.error('Failed to fetch flights', { error });
      throw new AppError('Database query failed', 500, error as Error);
    }
  }

  /**
   * Find a single flight by its ID
   */
  async findById(flightId: string): Promise<IFlight | null> {
    try {
      const flight = await Flight.findOne({ flightId }).lean().exec();
      return flight as IFlight | null;
    } catch (error) {
      logger.error(`Failed to find flight: ${flightId}`, { error });
      throw new AppError('Database query failed', 500, error as Error);
    }
  }

  /**
   * Perform bulk write operations
   */
  async bulkWrite(operations: BulkWriteOperation[]): Promise<void> {
    try {
      const result = await Flight.bulkWrite(operations);
      logger.info(`Bulk write completed: ${result.modifiedCount} modified, ${result.upsertedCount} inserted`);
    } catch (error) {
      logger.error('Bulk write operation failed', { error });
      throw new AppError('Bulk write failed', 500, error as Error);
    }
  }

  /**
   * Update a single flight by ID
   */
  async updateOne(flightId: string, updates: Partial<IFlight>): Promise<IFlight | null> {
    try {
      const updatedFlight = await Flight.findOneAndUpdate(
        { flightId },
        { $set: updates },
        { new: true, runValidators: true }
      ).lean().exec();

      if (updatedFlight) {
        logger.info(`Flight ${flightId} updated successfully`);
      }

      return updatedFlight as IFlight | null;
    } catch (error) {
      logger.error(`Failed to update flight: ${flightId}`, { error });
      throw new AppError('Update operation failed', 500, error as Error);
    }
  }

  
  async deleteAll(): Promise<void> {
    try {
      const result = await Flight.deleteMany({});
      logger.info(`Cleared ${result.deletedCount} flights from database`);
    } catch (error) {
      logger.error('Failed to clear flights', { error });
      throw new AppError('Delete operation failed', 500, error as Error);
    }
  }

  async deleteOne(flightId: string): Promise<void> {
    try {
      const result = await Flight.deleteOne({ flightId });
      if (result.deletedCount > 0) {
        logger.info(`Deleted flight: ${flightId}`);
      }
    } catch (error) {
      logger.error(`Failed to delete flight: ${flightId}`, { error });
      throw new AppError('Delete operation failed', 500, error as Error);
    }
  }

  async create(flightData: Partial<IFlight>): Promise<IFlight> {
    try {
      const flight = await Flight.findOneAndUpdate(
        { flightId: flightData.flightId },
        { $set: flightData },
        { new: true, upsert: true, runValidators: true }
      ).lean().exec();

      logger.info(`Flight ${flightData.flightId} created/updated via upsert`);
      return flight as IFlight;
    } catch (error) {
      logger.error(`Failed to create flight: ${flightData.flightId}`, { error });
      throw new AppError('Create operation failed', 500, error as Error);
    }
  }
}
