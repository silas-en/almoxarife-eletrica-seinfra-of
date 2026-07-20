import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { AuditService } from '../../database/audit.ts';
import { StorageService } from '../../storage/StorageService.ts';

export class EquipmentController {
  // EQUIPMENT REGISTRY
  static async getAllEquipments(req: AuthRequest, res: Response) {
    try {
      const equipments = await prisma.equipment.findMany({
        orderBy: { name: 'asc' },
      });
      res.json(equipments);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao buscar equipamentos.' });
    }
  }

  static async createEquipment(req: AuthRequest, res: Response) {
    try {
      const { name, code, type } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'O nome é obrigatório.' });
      }
      const equipment = await prisma.equipment.create({
        data: { name, code, type: type || 'EPI' },
      });

      await AuditService.log('CREATE', 'EQUIPMENT', req.user!.id, equipment.id, { name, code, type });
      res.status(201).json(equipment);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao cadastrar equipamento.' });
    }
  }

  static async updateEquipment(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, code, type } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'O nome é obrigatório.' });
      }

      const equipment = await prisma.equipment.update({
        where: { id },
        data: { name, code, type },
      });

      await AuditService.log('UPDATE', 'EQUIPMENT', req.user!.id, id, { name, code, type });
      res.json(equipment);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao atualizar equipamento.' });
    }
  }

  static async deleteEquipment(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.equipment.delete({ where: { id } });

      await AuditService.log('DELETE', 'EQUIPMENT', req.user!.id, id);
      res.status(204).send();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao excluir equipamento.' });
    }
  }

  // EQUIPMENT DELIVERIES
  static async getAllDeliveries(req: AuthRequest, res: Response) {
    try {
      const deliveries = await prisma.equipmentDelivery.findMany({
        include: {
          electrician: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          equipment: true,
        },
        orderBy: { deliveryDate: 'desc' },
      });
      res.json(deliveries);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao buscar entregas.' });
    }
  }

  static async createDelivery(req: AuthRequest, res: Response) {
    try {
      const { electricianId, equipmentId, quantity, deliveryDate, type, observation } = req.body;
      if (!electricianId || !equipmentId || !quantity || !deliveryDate || !type) {
        return res.status(400).json({ error: 'Faltam campos obrigatórios para o registro.' });
      }

      const delivery = await prisma.equipmentDelivery.create({
        data: {
          electricianId,
          equipmentId,
          quantity: Number(quantity),
          deliveryDate: new Date(deliveryDate),
          type,
          observation: observation || null,
        },
        include: {
          electrician: {
            select: { id: true, name: true },
          },
          equipment: true,
        },
      });

      await AuditService.log('CREATE', 'EQUIPMENT_DELIVERY', req.user!.id, delivery.id, {
        electricianId,
        equipmentId,
        quantity,
        deliveryDate,
        type,
      });

      res.status(201).json(delivery);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao registrar entrega.' });
    }
  }

  static async updateDelivery(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { electricianId, equipmentId, quantity, deliveryDate, type, observation } = req.body;

      const delivery = await prisma.equipmentDelivery.update({
        where: { id },
        data: {
          electricianId,
          equipmentId,
          quantity: Number(quantity),
          deliveryDate: new Date(deliveryDate),
          type,
          observation: observation || null,
        },
        include: {
          electrician: {
            select: { id: true, name: true },
          },
          equipment: true,
        },
      });

      await AuditService.log('UPDATE', 'EQUIPMENT_DELIVERY', req.user!.id, id, {
        electricianId,
        equipmentId,
        quantity,
        deliveryDate,
        type,
      });

      res.json(delivery);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao atualizar registro de entrega.' });
    }
  }

  static async deleteDelivery(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.equipmentDelivery.delete({ where: { id } });

      await AuditService.log('DELETE', 'EQUIPMENT_DELIVERY', req.user!.id, id);
      res.status(204).send();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao excluir registro de entrega.' });
    }
  }
}
