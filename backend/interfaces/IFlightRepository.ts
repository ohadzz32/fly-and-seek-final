import { IFlight } from '../models/Flight.types';


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

export interface IFlightRepository {
  findAll(): Promise<IFlight[]>;

  findById(flightId: string): Promise<IFlight | null>;

  bulkWrite(operations: BulkWriteOperation[]): Promise<void>;

  updateOne(flightId: string, updates: Partial<IFlight>): Promise<IFlight | null>;

  deleteAll(): Promise<void>;

  deleteOne(flightId: string): Promise<void>;

  create(flightData: Partial<IFlight>): Promise<IFlight>;

  getHistory(flightId: string, limit: number): Promise<any[]>;
}
