import { Request, Response } from 'express';
import prisma from '../../database/prisma.ts';

export class RecoveredController {
  async list(req: Request, res: Response) {
    try {
      const recovered = await prisma.returnedMaterial.findMany({
        where: { type: 'RECOVERED' },
        include: { material: true, demand: true },
        orderBy: { date: 'desc' }
      });
      res.json(recovered);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const { materialId, materialName, quantity, date } = req.body;
      const recovered = await prisma.returnedMaterial.create({
        data: {
          materialId: materialId || null,
          materialName: materialName || null,
          quantity: Number(quantity),
          type: 'RECOVERED',
          date: date ? new Date(date) : new Date()
        }
      });
      res.status(201).json(recovered);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { quantity, date } = req.body;
      const recovered = await prisma.returnedMaterial.update({
        where: { id },
        data: {
          quantity: Number(quantity),
          date: date ? new Date(date) : undefined
        }
      });
      res.json(recovered);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.returnedMaterial.delete({ where: { id } });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
