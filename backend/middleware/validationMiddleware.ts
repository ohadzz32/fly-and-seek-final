

import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';
import { validateHexColor, validateRunMode, validateFlightId } from '../utils/validators';


export function validateModeChange(req: Request, res: Response, next: NextFunction): void {
  try {
    const { mode } = req.body;

    if (!mode) {
      throw new ValidationError('Mode field is required');
    }

    if (typeof mode !== 'string') {
      throw new ValidationError('Mode must be a string');
    }

    validateRunMode(mode);
    next();
  } catch (error) {
    next(error);
  }
}


export function validateColorUpdate(req: Request, res: Response, next: NextFunction): void {
  try {
    const { color } = req.body;

    if (!color) {
      throw new ValidationError('Color field is required');
    }

    if (typeof color !== 'string') {
      throw new ValidationError('Color must be a string');
    }

    validateHexColor(color);
    next();
  } catch (error) {
    next(error);
  }
}


export function validateFlightIdParam(req: Request, res: Response, next: NextFunction): void {
  try {
    const { id } = req.params;
    validateFlightId(id);
    next();
  } catch (error) {
    next(error);
  }
}
