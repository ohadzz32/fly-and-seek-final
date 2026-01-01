import mongoose, { Schema, Document } from 'mongoose';
import { IFlight } from './Flight.types';


export interface IFlightDocument extends IFlight, Document {}


const flightSchema = new Schema<IFlightDocument>(
  {
    flightId: {
      type: String,
      required: [true, 'Flight ID is required'],
      unique: true,
      trim: true,
      index: true
    },
    latitude: {
      type: Number,
      required: [true, 'Latitude is required'],
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90']
    },
    longitude: {
      type: Number,
      required: [true, 'Longitude is required'],
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180']
    },
    velocity: {
      type: Number,
      required: true,
      min: [0, 'Velocity cannot be negative'],
      default: 0
    },
    trueTrack: {
      type: Number,
      required: true,
      min: [0, 'True track must be between 0 and 360'],
      max: [360, 'True track must be between 0 and 360'],
      default: 0
    },
    color: {
      type: String,
      required: true,
      default: '#FFDC00',
      validate: {
        validator: (v: string) => /^#[0-9A-F]{6}$/i.test(v),
        message: 'Color must be a valid hex color code'
      }
    },
    isGhost: {
      type : Boolean,
      required: true,
      default: false
    }
  },
  {
    timestamps: true,
    collection: 'flights'
  }
);


flightSchema.index({ latitude: 1, longitude: 1 });


export const Flight = mongoose.model<IFlightDocument>('Flight', flightSchema);
