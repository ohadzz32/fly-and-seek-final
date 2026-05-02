import { Flight } from '../models/Flight';
import { FlightHistory } from '../models/FlightHistory';
import { IFlightRepository, BulkWriteOperation } from '../interfaces/IFlightRepository';
import { IFlight } from '../models/Flight.types';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';


export class FlightRepository implements IFlightRepository {
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

  async findById(flightId: string): Promise<IFlight | null> {
    try {
      const flight = await Flight.findOne({ flightId }).lean().exec();
      return flight as IFlight | null;
    } catch (error) {
      logger.error(`Failed to find flight: ${flightId}`, { error });
      throw new AppError('Database query failed', 500, error as Error);
    }
  }

  async bulkWrite(operations: BulkWriteOperation[]): Promise<void> {
    try {
      const result = await Flight.bulkWrite(operations);
      
      // Auto-save history for each update in the bulk operation
      const historyEntries = operations
        .filter(op => op.updateOne && op.updateOne.update.$set)
        .map(op => {
          const update = op.updateOne.update.$set!;
          return {
            flightId: op.updateOne.filter.flightId as string,
            latitude: update.latitude,
            longitude: update.longitude,
            velocity: update.velocity || 0,
            heading: (update as any).trueTrack || 0,
            timestamp: new Date()
          };
        })
        .filter(entry => entry.latitude !== undefined && entry.longitude !== undefined);

      if (historyEntries.length > 0) {
        await FlightHistory.insertMany(historyEntries);
      }

      logger.info(`Bulk write completed: ${result.modifiedCount} modified, ${result.upsertedCount} inserted`);
    } catch (error) {
      logger.error('Bulk write operation failed', { error });
      throw new AppError('Bulk write failed', 500, error as Error);
    }
  }

  async updateOne(flightId: string, updates: Partial<IFlight>): Promise<IFlight | null> {
    try {
      const updatedFlight = await Flight.findOneAndUpdate(
        { flightId },
        { $set: updates },
        { new: true, runValidators: true }
      ).lean().exec();

      if (updatedFlight) {
        // Save to history
        await FlightHistory.create({
          flightId,
          latitude: updatedFlight.latitude,
          longitude: updatedFlight.longitude,
          velocity: updatedFlight.velocity,
          heading: updatedFlight.trueTrack,
          timestamp: new Date()
        });
        logger.info(`Flight ${flightId} updated successfully and history recorded`);
      }

      return updatedFlight as IFlight | null;
    } catch (error) {
      logger.error(`Failed to update flight: ${flightId}`, { error });
      throw new AppError('Update operation failed', 500, error as Error);
    }
  }

  async getHistory(flightId: string, limit: number): Promise<any[]> {
    try {
      const history = await FlightHistory.find({ flightId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean()
        .exec();
      
      // Return in chronological order (oldest to newest) for the ML model
      return history.reverse().map(h => ({
        lat: h.latitude,
        lon: h.longitude,
        alt: (h as any).altitude || 10000,
        velocity: h.velocity,
        heading: (h as any).heading || 0,
        time: new Date(h.timestamp).getTime() / 1000,
        vertical_rate: (h as any).verticalRate || 0
      }));
    } catch (error) {
      logger.error(`Failed to fetch history for flight: ${flightId}`, { error });
      throw new AppError('History query failed', 500, error as Error);
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
