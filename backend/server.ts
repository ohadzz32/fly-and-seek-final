import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Flight } from './models/Flight';

const app = express();
const PORT = 3001;

// הגדרות קבועות ל-OpenSky (ישראל)
const ISRAEL_BOUNDS = {
  lamin: 29.5, // דרום
  lomin: 34.2, // מערב
  lamax: 33.3, // צפון
  lomax: 35.9  // מזרח
};

app.use(cors());
app.use(express.json());

// --- חיבור למסד נתונים והפעלת שירותים ---
mongoose.connect('mongodb://localhost:27017/fly-and-seek')
  .then(() => {
    console.log('✅ Connected to MongoDB');
    
    // 1. טעינת נתונים ראשונית מקובץ (אם ה-DB ריק)
    seedDatabase().then(() => {
      // 2. הפעלת שירות הנתונים החיים מ-OpenSky
      fetchOpenSkyData(); // הפעלה ראשונה מיידית
      setInterval(fetchOpenSkyData, 15000); // ריענון כל 15 שניות
    });
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// --- לוגיקת OpenSky Service ---
async function fetchOpenSkyData() {
  try {
    console.log('🌐 Fetching live data from OpenSky...');
    const url = `https://opensky-network.org/api/states/all?lamin=${ISRAEL_BOUNDS.lamin}&lomin=${ISRAEL_BOUNDS.lomin}&lamax=${ISRAEL_BOUNDS.lamax}&lomax=${ISRAEL_BOUNDS.lomax}`;
    
    const response = await axios.get(url);
    const states = response.data.states || [];

    const formattedFlights = states.map((s: any) => ({
      flightId: s[0].trim(),         // icao24
      longitude: s[5],               // longitude
      latitude: s[6],                // latitude
      velocity: s[9] || 0,           // velocity
      trueTrack: s[10] || 0,         // true_track
      altitude: s[7] || 0            // baro_altitude
    }));

    if (formattedFlights.length > 0) {
      await updateFlightsInDataBase(formattedFlights);
      console.log(`✈️ Updated ${formattedFlights.length} live flights from OpenSky`);
    } else {
      console.log('ℹ️ No flights found in the requested area currently.');
    }

  } catch (error) {
    console.error('❌ OpenSky API Error:', error);
  }
}

// פונקציית עדכון חכם - שומרת על הצבעים שנבחרו ב-UI
async function updateFlightsInDataBase(flightsData: any[]) {
  try {
    const promises = flightsData.map(flight => 
      Flight.updateOne(
        { flightId: flight.flightId },
        { 
          $set: { 
            latitude: flight.latitude, 
            longitude: flight.longitude,
            velocity: flight.velocity,
            trueTrack: flight.trueTrack,
            altitude: flight.altitude
          } 
        },
        { upsert: true } // אם המטוס חדש - צור אותו, אם קיים - עדכן רק שדות אלו
      )
    );
    await Promise.all(promises);
  } catch (error) {
    console.error('❌ Error updating DB:', error);
  }
}

// --- פונקציות עזר ו-Routes ---

async function seedDatabase() {
  try {
    const count = await Flight.countDocuments();
    if (count === 0) {
      const filePath = path.join(__dirname, 'data', 'bird_data (1).geojson');
      if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const geoJson = JSON.parse(rawData);

        const birds = geoJson.features.map((feature: any) => ({
          flightId: feature.properties?.flightId || feature.id || `BIRD-${Math.random().toString(36).substr(2, 5)}`,
          longitude: feature.geometry.coordinates[0],
          latitude: feature.geometry.coordinates[1],
          velocity: feature.properties?.velocity || 0,
          trueTrack: feature.properties?.trueTrack || 0,
          altitude: feature.properties?.altitude || 0,
          color: '#FFDC00',
          isFrozen: false
        }));

        await Flight.insertMany(birds);
        console.log(`🚀 Successfully loaded ${birds.length} birds from GeoJSON`);
      }
    }
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  }
}

// GET all flights
app.get('/api/flights', async (req, res) => {
  try {
    const flights = await Flight.find();
    res.json(flights);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching flights' });
  }
});

// PATCH color for a specific flight
app.patch('/api/flights/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { color } = req.body;

    const updatedFlight = await Flight.findOneAndUpdate(
      { flightId: id },
      { $set: { color: color } },
      { new: true }
    );

    if (!updatedFlight) {
      return res.status(404).json({ message: "Flight not found" });
    }

    console.log(`🎨 UI Update: Flight ${id} changed to ${color}`);
    res.json(updatedFlight);
  } catch (error) {
    res.status(500).json({ message: 'Error updating flight color' });
  }
});

app.listen(PORT, () => {
  console.log(`📡 FlightsServer is running on http://localhost:${PORT}`);
});