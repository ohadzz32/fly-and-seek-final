import { IFlight } from '../models/Flight.types';

/**
 * Bulk write operation types for MongoDB operations
 */
export interface BulkUpdateOperation {
  updateOne: {
    filter: Record<string, unknown>;
    update: {
      $set?: Partial<IFlight>;
      $setOnInsert?: Partial<IFlight>;
    };
    upsert?: boolean;
  };
}

export type BulkWriteOperation = BulkUpdateOperation;

/**
 * Repository interface for flight data operations
 * Follows repository pattern for data access abstraction
 */
export interface IFlightRepository {
  /** Find all flights in the database */
  findAll(): Promise<IFlight[]>;

  /** Find a single flight by its ID */
  findById(flightId: string): Promise<IFlight | null>;

  /** Perform bulk write operations (update/insert many) */
  bulkWrite(operations: BulkWriteOperation[]): Promise<void>;

  /** Update a single flight */
  updateOne(flightId: string, updates: Partial<IFlight>): Promise<IFlight | null>;

  /** Delete all flights */
  deleteAll(): Promise<void>;

  /** Delete a single flight */
  deleteOne(flightId: string): Promise<void>;

  /** Create a new flight (upsert) */
  create(flightData: Partial<IFlight>): Promise<IFlight>;
}
