# 🚀 Quick Start Guide - OpenSky Radar Simulation

## Prerequisites

✅ Node.js installed  
✅ Historical dataset file: `backend/datasetforflight/states_2017-06-05-01.json` (~450MB)

## Step 1: Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

## Step 2: Start Backend Server

```bash
cd backend
npm run dev
```

**Expected output:**
```
🚀 Starting Flight Tracking Server...
✅ Connected to MongoDB successfully
✅ Default service (OFFLINE) initialized
🚀 Server running on http://localhost:3001
🔌 Socket.io enabled for real-time updates
🔄 Loading OpenSky historical dataset...
✅ Loaded 12543 aircraft states from historical dataset
📊 Dataset timestamp: 2017-06-05T01:00:00.000Z
🚀 Starting historical data streaming
📡 Sending 400 flights every 1000ms
✅ Server initialization complete
```

## Step 3: Start Frontend

Open a **new terminal**:

```bash
cd frontend
npm run dev
```

**Expected output:**
```
VITE v5.x.x ready in xxx ms

➜  Local:   http://localhost:5173/
➜  press h + enter to show help
```

## Step 4: Open Browser

Navigate to: **http://localhost:5173/**

You should see:
- ✅ Socket.io connection established
- ✅ Flights appearing on map
- ✅ Real-time updates every second
- ✅ Console logs showing batch updates

## 📊 Console Monitoring

### Backend Console
```
✅ Client connected: xyz123
📤 Sent batch of 400 flights to 1 client(s)
📤 Sent batch of 400 flights to 1 client(s)
🔄 Completed full dataset cycle, restarting from beginning
```

### Frontend Console (Browser)
```
✅ Connected to Socket.io server
📊 Server stats: { totalAircraft: 12543, currentBatchIndex: 800, ... }
Received 400 flights
Received 400 flights
```

## 🎮 How to Use

1. **Watch the map** - Aircraft will appear and update in real-time
2. **Zoom/pan** - Use mouse to navigate the 3D globe
3. **Check performance** - Monitor framerate and aircraft count
4. **Ghost mode** - Click on aircraft to enable tracking

## ⚙️ Performance Tuning

If experiencing lag, adjust these settings:

**Backend** (`backend/services/OpenSkyHistoricalService.ts`):
```typescript
private readonly BATCH_SIZE = 400;        // Reduce to 200-300
private readonly UPDATE_INTERVAL = 1000;  // Increase to 2000-3000
```

**Frontend** (`frontend/src/hooks/useFlightData.ts`):
```typescript
const MAX_FLIGHTS = 3000;  // Reduce to 1500-2000
```

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Dataset file not found" | Ensure file exists at `backend/datasetforflight/states_2017-06-05-01.json` |
| "Failed to connect to server" | Verify backend is running on port 3001 |
| "CORS error" | Check that frontend URL is in allowed origins |
| No flights appearing | Open browser console, check for Socket.io errors |
| High memory usage | Reduce MAX_FLIGHTS in both backend and frontend |

## 📝 File Checklist

```
✅ backend/datasetforflight/states_2017-06-05-01.json (your data file)
✅ backend/services/OpenSkyHistoricalService.ts
✅ backend/server.ts (updated with Socket.io)
✅ frontend/src/hooks/useFlightData.ts (updated with Socket.io)
✅ backend/.gitignore (excludes dataset)
```

## 🎯 Success Indicators

✅ Backend starts without errors  
✅ Frontend connects to Socket.io  
✅ Flights visible on map within 1-2 seconds  
✅ Flight count increases up to 3000  
✅ Smooth 60fps rendering  
✅ No console errors

## 📚 More Information

See [OPENSKY_SIMULATION.md](OPENSKY_SIMULATION.md) for detailed technical documentation.
