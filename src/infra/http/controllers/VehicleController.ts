import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { AuditService } from '../../database/audit.ts';

export class VehicleController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const vehicles = await prisma.vehicle.findMany({
        orderBy: { name: 'asc' },
      });
      res.json(vehicles);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, plate } = req.body;
      const vehicle = await prisma.vehicle.create({
        data: { name, plate },
      });

      await AuditService.log('CREATE', 'VEHICLE', req.user!.id, vehicle.id, { name, plate });
      res.status(201).json(vehicle);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, plate } = req.body;
      const vehicle = await prisma.vehicle.update({
        where: { id },
        data: { name, plate },
      });

      await AuditService.log('UPDATE', 'VEHICLE', req.user!.id, id, { name, plate });
      res.json(vehicle);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.vehicle.delete({ where: { id } });

      await AuditService.log('DELETE', 'VEHICLE', req.user!.id, id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
