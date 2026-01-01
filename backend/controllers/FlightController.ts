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
}
