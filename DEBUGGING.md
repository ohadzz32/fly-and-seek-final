# 🐛 Debugging Guide - Aircraft Not Showing

## Quick Checklist

### Backend (Terminal 1)
```bash
cd backend
npm run dev
```

**Expected Output:**
```
✅ Connected to MongoDB successfully
✅ Default service (OFFLINE) initialized
🚀 Server running on http://localhost:3001
🔌 Socket.io enabled for real-time updates
✅ Socket.io handlers configured
🔄 Loading OpenSky historical dataset...
✅ Loaded 12543 aircraft states from historical dataset
📊 Dataset timestamp: 2017-06-05T01:00:00.000Z
🚀 Starting historical data streaming
📡 Sending 400 flights every 1000ms
✅ Historical data streaming initialized
✅ Server initialization complete
```

**If you see this when client connects:**
```
✅ Client connected: xyz123abc
📊 Total connected clients: 1
📤 Sent stats to xyz123abc: { totalAircraft: 12543, ... }
📤 Sent batch of 400 flights to 1 client(s) [Index: 0-400]
📤 Sent batch of 400 flights to 1 client(s) [Index: 400-800]
```

### Frontend (Terminal 2)
```bash
cd frontend
npm run dev
```

**Open http://localhost:5173**

### Browser Console (F12)

**Expected Output:**
```
✅ Connected to Socket.io server
Socket ID: xyz123abc
🔗 Connection status: CONNECTED
📊 Server stats: { totalAircraft: 12543, currentBatchIndex: 0, ... }
📥 Received 400 flights from server
Sample flight: { flightId: "a12345", latitude: 37.6189, longitude: -122.3789, ... }
✈️ Total flights in state: 400
📥 Received 400 flights from server
✈️ Total flights in state: 800
```

## Common Issues & Solutions

### ❌ Issue 1: "TransportError" or WebSocket Connection Failed

**Symptoms:**
```
TransportError: websocket error
Failed to connect: xhr poll error
```

**Solution:**
1. ✅ Verify backend is running on port 3001
2. ✅ Check if firewall is blocking connections
3. ✅ Try restarting both backend and frontend
4. ✅ Clear browser cache (Ctrl+Shift+Delete)

### ❌ Issue 2: "maxTextureDimension2D" WebGL Error

**Status:** ✅ **FIXED** - Added `glOptions` to DeckGL component

**Verification:**
Check [App.tsx](frontend/src/App.tsx) for:
```tsx
<DeckGL
  glOptions={{
    preserveDrawingBuffer: true,
    stencil: true
  }}
>
```

### ❌ Issue 3: Connected but No Aircraft Visible

**Check these in order:**

1. **Backend logs show data being sent?**
   ```
   📤 Sent batch of 400 flights...
   ```
   - ✅ Yes → Go to step 2
   - ❌ No → Check if dataset file exists at `backend/datasetforflight/states_2017-06-05-01.json`

2. **Browser console shows data received?**
   ```
   📥 Received 400 flights from server
   ```
   - ✅ Yes → Go to step 3
   - ❌ No → Socket.io connection issue, see Issue 1

3. **Flights count increasing in state?**
   ```
   ✈️ Total flights in state: 400
   ✈️ Total flights in state: 800
   ```
   - ✅ Yes → Go to step 4
   - ❌ No → Check browser console for JavaScript errors

4. **Check data structure in console:**
   ```javascript
   // Paste in browser console:
   console.log(window.__DECK_GL_DEBUG__);
   ```
   - Look for `airplane-layer` with data array
   - Verify latitude/longitude values are valid numbers

### ❌ Issue 4: Data Structure Mismatch

**Verify field names match:**

Backend sends:
```json
{
  "flightId": "a12345",
  "callsign": "UAL123",
  "latitude": 37.6189,
  "longitude": -122.3789,
  "velocity": 227.5,
  "trueTrack": 85.3,
  "color": "#FFD700"
}
```

Frontend expects (in IFlight):
```typescript
interface IFlight {
  flightId: string;
  callsign?: string;
  latitude: number;    // NOT "lat"
  longitude: number;   // NOT "lon" or "lng"
  velocity: number;
  trueTrack: number;
  color: string;
}
```

### ❌ Issue 5: Dataset File Missing

**Error in backend:**
```
❌ Dataset file not found at: ...
```

**Solution:**
1. Verify file exists: `backend/datasetforflight/states_2017-06-05-01.json`
2. Check file size (should be ~450MB)
3. Verify JSON format matches `SAMPLE_FORMAT.json`

## Visual Indicators

### Connection Status Badge (Top-Left)

**Green Badge with Pulse:**
```
🟢 מחובר | 1234 מטוסים
```
✅ Everything working!

**Red Badge:**
```
🔴 מנותק
```
❌ Not connected to backend

**Yellow Badge:**
```
🟡 מתחבר...
```
⏳ Attempting connection

## Debug Commands

### Backend Health Check
```bash
curl http://localhost:3001/api/config
```

### Socket.io Connection Test
Open browser console and paste:
```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3001');
socket.on('connect', () => console.log('✅ Manual test: Connected!'));
socket.on('flights_update', (data) => console.log('✅ Received:', data.length, 'flights'));
```

### Force Reconnect (Browser Console)
```javascript
location.reload();
```

## Performance Checks

### Expected Metrics

| Metric | Expected Value | Action if Different |
|--------|---------------|---------------------|
| Backend Memory | ~500-800MB | Normal |
| Frontend FPS | 50-60 fps | Reduce MAX_FLIGHTS if lower |
| Network (per sec) | ~20KB | Normal |
| Flights in state | Up to 3000 | Working as designed |
| Connection latency | <100ms | Check network |

### Browser Performance Monitor

Open DevTools → Performance → Record
- Look for smooth 60fps
- Check for memory leaks (should stabilize)
- Verify no long tasks blocking rendering

## Still Not Working?

### Full Reset Procedure

1. **Stop all servers**
   ```bash
   # Press Ctrl+C in both terminals
   ```

2. **Clear all caches**
   ```bash
   # Backend
   cd backend
   rm -rf node_modules
   npm install
   
   # Frontend
   cd frontend
   rm -rf node_modules .vite
   npm install
   ```

3. **Verify dataset file**
   ```bash
   # Check file exists
   ls -lh backend/datasetforflight/states_2017-06-05-01.json
   
   # Should show ~450MB file
   ```

4. **Restart in order**
   ```bash
   # Terminal 1: Backend
   cd backend
   npm run dev
   
   # Wait for "✅ Server initialization complete"
   
   # Terminal 2: Frontend
   cd frontend
   npm run dev
   ```

5. **Open fresh browser session**
   - Use incognito/private mode
   - Open http://localhost:5173
   - Check console for errors

## Getting Help

### Information to Provide

When asking for help, include:

1. **Backend console output** (last 20 lines)
2. **Browser console output** (all errors in red)
3. **Connection status badge color** (green/yellow/red)
4. **Dataset file size** (`ls -lh backend/datasetforflight/*.json`)
5. **Node version** (`node --version`)
6. **Browser name and version**

### Quick Diagnostic

Run this in browser console:
```javascript
const diagnostic = {
  userAgent: navigator.userAgent,
  socketConnected: window.socketConnected || 'unknown',
  flightCount: window.flightCount || 'unknown',
  webGLSupported: !!document.createElement('canvas').getContext('webgl2'),
  currentURL: window.location.href
};
console.log('🔍 Diagnostic Info:', JSON.stringify(diagnostic, null, 2));
```

Copy the output and include it when reporting issues.

---

## Success Checklist ✅

When everything works, you should have:

- [x] ✅ Backend console shows "Sent batch of X flights"
- [x] ✅ Browser console shows "Received X flights"
- [x] ✅ Green connection badge showing flight count
- [x] ✅ Aircraft icons visible on map
- [x] ✅ Smooth animation as aircraft move
- [x] ✅ No red errors in console
- [x] ✅ 60fps rendering performance

**If all boxes checked: 🎉 System is working perfectly!**
