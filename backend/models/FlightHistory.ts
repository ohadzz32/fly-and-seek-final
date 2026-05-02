import mongoose, { Schema, Document } from 'mongoose';

export interface IFlightHistory {
  flightId: string;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  verticalRate: number;
  timestamp: Date;
}

export interface IFlightHistoryDocument extends IFlightHistory, Document {}

const flightHistorySchema = new Schema<IFlightHistoryDocument>(
  {
    flightId: {
      type: String,
      required: true,
      index: true
    },
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    },
    altitude: {
      type: Number,
      default: 10000
    },
    velocity: {
      type: Number,
      default: 0
    },
    heading: {
      type: Number,
      default: 0
    },
    verticalRate: {
      type: Number,
      default: 0
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    collection: 'flight_history'
  }
);

// Optional: Auto-expire records after 1 hour to keep DB clean
flightHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 3600 });

export const FlightHistory = mongoose.models.FlightHistory || mongoose.model<IFlightHistoryDocument>('FlightHistory', flightHistorySchema);
