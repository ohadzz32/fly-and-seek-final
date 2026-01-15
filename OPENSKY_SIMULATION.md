# OpenSky Historical Data Simulation

This project now includes real-time simulation of historical flight data from OpenSky Network (June 2017).

## 📁 Data File Structure

The system expects a large JSON file at:
```
backend/datasetforflight/states_2017-06-05-01.json
```

**⚠️ Important:** This file is ~450MB and is **not** included in the repository (see `.gitignore`).

### Data Format

The JSON file should follow OpenSky's standard format:
```json
{
  "time": 1496624400,
  "states": [
    [
      "icao24",      // [0] Aircraft identifier
      "callsign",    // [1] Callsign
      "country",     // [2] Origin country
      null,          // [3] Time position
      1234567890,    // [4] Last contact
      -122.5,        // [5] Longitude
      37.7,          // [6] Latitude
      10000,         // [7] Barometric altitude
      false,         // [8] On ground
      250.5,         // [9] Velocity (m/s)
      180.0,         // [10] True track (degrees)
      0.0,           // [11] Vertical rate
      null,          // [12] Sensors
      10500,         // [13] Geometric altitude
      null,          // [14] Squawk
      false,         // [15] SPI
      0              // [16] Position source
    ]
  ]
}
```

## 🚀 How It Works

### Backend (Node.js + Socket.io)

1. **OpenSkyHistoricalService** loads the dataset on startup
2. Streams **400 aircraft** every **1 second** via Socket.io
3. Maps OpenSky array format to `IFlight` interface:
   - `flightId` ← index [0] (icao24)
   - `callsign` ← index [1]
   - `longitude` ← index [5]
   - `latitude` ← index [6]
   - `velocity` ← index [9]
   - `trueTrack` ← index [10]

### Frontend (React + Socket.io-client)

1. **useFlightData** hook connects to `http://localhost:3001`
2. Maintains real-time state of flights (max 3000 aircraft)
3. Updates existing aircraft by ID and adds new ones
4. Automatically limits total flights for performance

## 🎯 Usage

### Start Backend
```bash
cd backend
npm install
npm run dev
```

The server will:
- ✅ Load the historical dataset
- 🚀 Start streaming data
- 📡 Listen for Socket.io connections on port 3001

### Start Frontend
```bash
cd frontend
npm install
npm run dev
```

The frontend will:
- 🔌 Connect to Socket.io server
- 📊 Receive real-time flight updates
- 🗺️ Display flights on Deck.gl map

## 📊 Monitoring

Check the backend console for:
- Total aircraft loaded
- Current streaming status
- Connected clients count
- Batch sending progress

## ⚙️ Configuration

You can adjust these constants in `OpenSkyHistoricalService.ts`:

```typescript
private readonly BATCH_SIZE = 400;           // Aircraft per batch
private readonly UPDATE_INTERVAL = 1000;     // Milliseconds between batches
private readonly MAX_FLIGHTS_TO_SEND = 3000; // Max flights to track
```

And in `useFlightData.ts`:

```typescript
const MAX_FLIGHTS = 3000;  // Max flights in frontend state
```

## 🛡️ Safety Features

1. **.gitignore** prevents committing large dataset files
2. Service gracefully handles missing dataset (server continues without streaming)
3. Frontend limits total flights to prevent performance issues
4. Automatic reconnection on Socket.io disconnection

## 🔧 Troubleshooting

**Dataset not found:**
- Ensure file exists at `backend/datasetforflight/states_2017-06-05-01.json`
- Check file permissions
- Server will log error but continue running

**No flights appearing:**
- Check browser console for Socket.io connection status
- Verify backend is running and streaming has started
- Check for CORS issues (allowed origins: localhost:5173, 5174, 3000)

**Performance issues:**
- Reduce `BATCH_SIZE` to send fewer aircraft per batch
- Increase `UPDATE_INTERVAL` for slower updates
- Decrease `MAX_FLIGHTS` to track fewer aircraft

## 📝 Notes

- The system loops through the dataset continuously
- Dataset timestamp is logged on startup
- All times are converted to ISO format in frontend
- Original API routes still exist for backward compatibility
