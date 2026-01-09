import { Request, Response } from 'express';
import { DIContainer } from '../container/DIContainer';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { FlightRepository } from '../repositories/FlightRepository';
import { Flight } from '../models/Flight';


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

async toggleGhostStatus(req: Request, res: Response): Promise<void> { // ghost mode on/off
  try {
    const { id } = req.params;
    const flight = await this.repository.findById(id); // find the fight by id

    if (!flight) {
      res.status(404).json({ message: 'Flight not found in the DB' });    // if the flight is not found 
      return;
    }

    if (!flight.isGhost) {  
      await this.repository.updateOne(id, { isGhost: true });

      const shadowId = `${flight.flightId}-shadow`;
      const shadowData = {    
        flightId: shadowId,
        longitude: flight.longitude,
        latitude: flight.latitude,
        velocity: flight.velocity,
        trueTrack: flight.trueTrack,
        color: '#999696ff',
        isGhost: false
      };

      await this.repository.create(shadowData);
      
      logger.info(`Ghost Mode ON: Flight ${id} frozen. Shadow ${shadowId} created.`);
      res.status(200).json({ success: true, mode: 'activated' });
    } else {
      await this.repository.updateOne(id, { isGhost: false });
      
      const shadowId = `${flight.flightId}-shadow`;
      await this.repository.deleteOne(shadowId);

      logger.info(`Ghost Mode OFF: Flight ${id} is now active again. Shadow deleted.`);
      res.status(200).json({ success: true, mode: 'deactivated' });
    }
  } catch (error: any) {
    logger.error('Error in toggleGhostStatus:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal Server Error', 
      error: error.message 
    });
  }
}
}
