import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { AuditService } from '../../database/audit.ts';

export class ToolController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const tools = await prisma.tool.findMany({
        orderBy: { name: 'asc' },
      });
      res.json(tools);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, code } = req.body;
      const tool = await prisma.tool.create({
        data: { name, code },
      });

      await AuditService.log('CREATE', 'TOOL', req.user!.id, tool.id, { name, code });
      res.status(201).json(tool);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, code } = req.body;
      const tool = await prisma.tool.update({
        where: { id },
        data: { name, code },
      });

      await AuditService.log('UPDATE', 'TOOL', req.user!.id, id, { name, code });
      res.json(tool);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.tool.delete({ where: { id } });

      await AuditService.log('DELETE', 'TOOL', req.user!.id, id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
