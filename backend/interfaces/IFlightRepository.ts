

import { IFlight } from '../models/Flight.types';


export interface IFlightRepository {
  
  findAll(): Promise<IFlight[]>;

  
  findById(flightId: string): Promise<IFlight | null>;

  
  bulkWrite(operations: any[]): Promise<void>;

  
  updateOne(flightId: string, updates: Partial<IFlight>): Promise<IFlight | null>;

  
  deleteAll(): Promise<void>;

  deleteOne(flightId: string): Promise<void>;

  create(flightData: Partial<IFlight>): Promise<IFlight>;
}
