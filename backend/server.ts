import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { Flight } from './models/Flight';
import { IFlightService, RunMode } from './services/FlightService.types';
import { OfflineService } from './services/OfflineService';
import { RealTimeService } from './services/RealTimeService';
import { SnapService } from './services/SnapService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fly-and-seek';

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

let currentService: IFlightService | null = null;


async function switchService(newMode: RunMode): Promise<void> {
  try {
    if (currentService) {
      console.log(`🛑 Stopping ${currentService.mode} service...`);
      currentService.stop();
      currentService = null; 
    }

    console.log(`🔄 Creating ${newMode} service...`);
    switch (newMode) {
      case 'OFFLINE':
        currentService = new OfflineService();
        break;
      case 'REALTIME':
        currentService = new RealTimeService();
        break;
      case 'SNAP':
        currentService = new SnapService();
        break;
      default:
        throw new Error(`Invalid mode: ${newMode}`);
    }

    console.log(`▶️ Starting ${newMode} service...`);
    await currentService.start();
    console.log(`🚀 System is now running in ${newMode} mode`);
    
  } catch (error: any) {
    console.error('❌ Error switching service:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    await switchService('OFFLINE');
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });


app.get('/api/config/mode', (req, res) => {
  res.json({ mode: currentService?.mode || 'OFFLINE' });
});


app.post('/api/config/mode', async (req, res) => {
  console.log(' Received mode change request:', req.body);
  
  try {
    const { mode } = req.body;
    const validModes: RunMode[] = ['OFFLINE', 'REALTIME', 'SNAP'];

    if (!mode) {
      console.error(' No mode provided in request');
      return res.status(400).json({ error: 'Mode is required' });
    }

    if (!validModes.includes(mode)) {
      console.error(' Invalid mode:', mode);
      return res.status(400).json({ error: 'Invalid mode. Must be: OFFLINE, REALTIME, or SNAP' });
    }

    console.log(` Switching to ${mode} mode...`);
    await switchService(mode);
    console.log(` Successfully switched to ${mode}`);
    res.json({ success: true, currentMode: mode });
    
  } catch (error: any) {
    console.error(' Error switching mode:', error);
    res.status(500).json({ error: error.message || 'Failed to switch mode' });
  }
});


app.get('/api/flights', async (req, res) => {
  try {
    const flights = await Flight.find().lean();
    res.json(flights);
  } catch (error) {
    console.error('Error fetching flights:', error);
    res.status(500).json({ error: 'Failed to fetch flights' });
  }
});



app.patch('/api/flights/:id', async (req, res) => {
  try {
    const { color } = req.body;
    
    if (!color) {
      return res.status(400).json({ error: 'Color is required' });
    }

    const updated = await Flight.findOneAndUpdate(
      { flightId: req.params.id },
      { $set: { color } }, 
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Flight not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating flight:', error);
    res.status(500).json({ error: 'Failed to update flight' });
  }
});

app.listen(PORT, () => {
  console.log(`📡 Server listening on http://localhost:${PORT}`);
});


process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (currentService) {
    currentService.stop();
  }
  mongoose.connection.close();
  process.exit(0);
});