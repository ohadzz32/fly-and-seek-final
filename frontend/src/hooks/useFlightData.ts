import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { IFlight } from '../types/Flight.types';

const SOCKET_URL = 'http://localhost:3001';
const MAX_FLIGHTS = 3000;

export const useFlightData = () => {
  const [flights, setFlights] = useState<IFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initialize Socket.io connection
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Connected to Socket.io server');
      console.log('Socket ID:', socket.id);
      setConnected(true);
      setLoading(false);
      setError(null);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from Socket.io server. Reason:', reason);
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Connection error:', err.message);
      console.error('Error details:', err);
      setError(`Failed to connect: ${err.message}`);
      setLoading(false);
    });

    // Listen for flight updates
    socket.on('flights_update', (newFlights: IFlight[]) => {
      console.log(`📥 Received ${newFlights.length} flights from server`);
      if (newFlights.length > 0) {
        console.log('Sample flight:', newFlights[0]);
      }
      
      setFlights(prevFlights => {
        // Use Map for efficient updates by flightId
        const flightsMap = new Map<string, IFlight>();
        
        // Add existing flights
        prevFlights.forEach(flight => {
          flightsMap.set(flight.flightId, flight);
        });

        // Update/add new flights
        newFlights.forEach(flight => {
          flightsMap.set(flight.flightId, {
            ...flight,
            lastUpdated: new Date().toISOString()
          });
        });

        // Convert back to array and limit size
        let updatedFlights = Array.from(flightsMap.values());
        
        // If we exceed max flights, keep the most recently updated ones
        if (updatedFlights.length > MAX_FLIGHTS) {
          updatedFlights = updatedFlights
            .sort((a, b) => {
              const timeA = new Date(a.lastUpdated || 0).getTime();
              const timeB = new Date(b.lastUpdated || 0).getTime();
              return timeB - timeA;
            })
            .slice(0, MAX_FLIGHTS);
        }

        console.log(`✈️ Total flights in state: ${updatedFlights.length}`);
        return updatedFlights;
      });
    });

    // Listen for stats updates
    socket.on('stats', (stats) => {
      console.log('📊 Server stats:', stats);
    });

    // Cleanup on unmount
    return () => {
      console.log('🔌 Disconnecting Socket.io');
      socket.disconnect();
    };
  }, []);

  // Debug: Log connection status changes
  useEffect(() => {
    console.log('🔗 Connection status:', connected ? 'CONNECTED' : 'DISCONNECTED');
    console.log('✈️ Current flights count:', flights.length);
  }, [connected, flights.length]);

  const updateFlightColor = (flightId: string, color: string) => {
    setFlights(prev => 
      prev.map(f => f.flightId === flightId ? { ...f, color } : f)
    );
  };

  const toggleGhostMode = (flightId: string) => {
    setFlights(prev =>
      prev.map(f => 
        f.flightId === flightId ? { ...f, isGhost: !f.isGhost } : f
      )
    );
  };

  return {
    flights,
    loading,
    error,
    connected,
    updateFlightColor,
    toggleGhostMode
  };
};