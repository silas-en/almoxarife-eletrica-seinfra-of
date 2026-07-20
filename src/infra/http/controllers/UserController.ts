import { Request, Response } from 'express';
import prisma from '../../database/prisma.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';

export class UserController {
  static async getPending(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany({
        where: { status: 'PENDING' },
        select: { id: true, username: true, name: true, role: true, createdAt: true },
      });
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async approve(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { status } = req.body; // 'APPROVED' or 'REJECTED'

      if (!['APPROVED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { status },
      });

      res.json({ message: `User ${status.toLowerCase()} successfully` });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getAll(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, username: true, name: true, role: true, status: true },
        orderBy: { name: 'asc' }
      });
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      console.log(`[UserController] Attempting to delete user: ${userId} by requester: ${req.user?.id}`);

      // Prevent users from deleting themselves
      if (userId === req.user?.id) {
        return res.status(400).json({ error: 'Você não pode excluir sua própria conta.' });
      }

      const userToDelete = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });

      if (!userToDelete) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      await prisma.user.delete({
        where: { id: userId },
      });

      res.json({ message: 'User deleted successfully' });
    } catch (error: any) {
      if (error.code === 'P2003') {
        return res.status(400).json({ 
          error: 'Não é possível excluir o usuário pois ele possui demandas ou registros vinculados.' 
        });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
