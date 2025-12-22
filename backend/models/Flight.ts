import mongoose from 'mongoose';

const flightSchema = new mongoose.Schema({
  flightId: { type: String, required: true, unique: true },
  latitude: Number,
  longitude: Number,
  velocity: Number,
  trueTrack: Number,
  color: { type: String, default: '#FFDC00' } 
});

export const Flight = mongoose.model('Flight', flightSchema);