/**
 * FlightController.ts - Flight API Endpoints
 * 
 * Handles HTTP requests for flight data:
 * - GET /flights - List all flights
 * - PATCH /flights/:id/color - Update flight color
 * - POST /flights/:id/ghost - Toggle ghost mode
 */

import { Request, Response } from 'express';
import { DIContainer } from '../container/DIContainer';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

export class FlightController {
  private readonly repository = DIContainer.getInstance().getFlightRepository();

  
  async getAllFlights(req: Request, res: Response): Promise<void> {
    const flights = await this.repository.findAll();
    
    logger.info(`Retrieved ${flights.length} flights for client`);
    
    res.json({
      success: true,
      data: flights,
      count: flights.length
    });
  }

  
  async updateFlightColor(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { color } = req.body;

    const updatedFlight = await this.repository.updateOne(id, { color });

    if (!updatedFlight) {
      throw new NotFoundError('Flight', id);
    }

    logger.info(`Flight ${id} color updated to ${color}`);

    res.json({
      success: true,
      data: updatedFlight
    });
  }

async toggleGhostStatus(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const flight = await this.repository.findById(id);

    if (!flight) {
      throw new NotFoundError('Flight', id);
    }

    const SHADOW_COLOR = '#999696ff';

    if (!flight.isGhost) {
      // Activate ghost mode - freeze this flight and create shadow
      await this.repository.updateOne(id, { isGhost: true });

      const shadowId = `${flight.flightId}-shadow`;
      const shadowData = {
        flightId: shadowId,
        longitude: flight.longitude,
        latitude: flight.latitude,
        velocity: flight.velocity,
        trueTrack: flight.trueTrack,
        color: SHADOW_COLOR,
        isGhost: false
      };

      await this.repository.create(shadowData);

      logger.info(`Ghost Mode ON: Flight ${id} frozen. Shadow ${shadowId} created.`);
      res.json({ success: true, data: { mode: 'activated' } });
    } else {
      // Deactivate ghost mode - unfreeze flight and delete shadow
      await this.repository.updateOne(id, { isGhost: false });

      const shadowId = `${flight.flightId}-shadow`;
      await this.repository.deleteOne(shadowId);

      logger.info(`Ghost Mode OFF: Flight ${id} is now active again. Shadow deleted.`);
      res.json({ success: true, data: { mode: 'deactivated' } });
    }
  }
}
