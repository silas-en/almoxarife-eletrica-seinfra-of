import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import { StorageService } from '../../storage/StorageService.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { AuditService } from '../../database/audit.ts';
import { retroactiveSplitForExclusiveMaterial } from './DemandController.ts';

export class MaterialController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const materials = await prisma.material.findMany();
      res.json(materials.map(m => StorageService.mapMaterial(m)));
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, unit, components, isExclusive } = req.body;
      let imageUrl = null;

      if (req.file) {
        const fileKey = `materials/${Date.now()}-${req.file.originalname}`;
        imageUrl = await StorageService.uploadFile(
          'materials-images',
          fileKey,
          req.file.buffer,
          req.file.mimetype
        );
      }

      let parsedComponents = null;
      if (components) {
        try {
          parsedComponents = typeof components === 'string' ? JSON.parse(components) : components;
        } catch (e) {
          console.error('[MaterialController] Error parsing components on create:', e);
        }
      }

      const isExclusiveBool = isExclusive === true || isExclusive === 'true';

      const material = await prisma.material.create({
        data: { 
          name, 
          imageUrl, 
          unit: unit || 'un',
          isExclusive: isExclusiveBool,
          components: parsedComponents || null
        },
      });

      await AuditService.log('CREATE', 'MATERIAL', req.user!.id, material.id, { name, unit });

      res.status(201).json(StorageService.mapMaterial(material));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, unit, removeImage, components, isExclusive } = req.body;
      let imageUrl = undefined;

      if (req.file) {
        const fileKey = `materials/${Date.now()}-${req.file.originalname}`;
        imageUrl = await StorageService.uploadFile(
          'materials-images',
          fileKey,
          req.file.buffer,
          req.file.mimetype
        );
      } else if (removeImage === 'true') {
        imageUrl = null;
      }

      let parsedComponents = undefined;
      if (components !== undefined) {
        try {
          parsedComponents = typeof components === 'string' ? JSON.parse(components) : components;
        } catch (e) {
          console.error('[MaterialController] Error parsing components on update:', e);
        }
      }

      let isExclusiveBool = undefined;
      if (isExclusive !== undefined) {
        isExclusiveBool = isExclusive === true || isExclusive === 'true';
      }

      const material = await prisma.material.update({
        where: { id },
        data: { 
          name, 
          unit, 
          imageUrl,
          isExclusive: isExclusiveBool,
          components: parsedComponents !== undefined ? (parsedComponents || null) : undefined
        },
      });

      await AuditService.log('UPDATE', 'MATERIAL', req.user!.id, id, { name, unit });

      res.json(StorageService.mapMaterial(material));
    } catch (error) {
      console.error('Error updating material:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.material.delete({ where: { id } });

      await AuditService.log('DELETE', 'MATERIAL', req.user!.id, id);

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async merge(req: AuthRequest, res: Response) {
    try {
      const { sourceId, targetId } = req.body;

      if (!sourceId || !targetId) {
        return res.status(400).json({ error: 'Os IDs do material de origem e de destino são obrigatórios' });
      }

      if (sourceId === targetId) {
        return res.status(400).json({ error: 'Não é possível fundir um material com ele mesmo' });
      }

      const [sourceMaterial, targetMaterial] = await Promise.all([
        prisma.material.findUnique({ where: { id: sourceId } }),
        prisma.material.findUnique({ where: { id: targetId } })
      ]);

      if (!sourceMaterial) {
        return res.status(404).json({ error: 'Material de origem não encontrado' });
      }
      if (!targetMaterial) {
        return res.status(404).json({ error: 'Material de destino não encontrado' });
      }

      await prisma.$transaction(async (tx) => {
        // 1. DemandMaterial (planned)
        const plannedSources = await tx.demandMaterial.findMany({
          where: { materialId: sourceId }
        });

        for (const pSource of plannedSources) {
          const existingTarget = await tx.demandMaterial.findFirst({
            where: {
              demandId: pSource.demandId,
              materialId: targetId,
              borrowed: pSource.borrowed,
              borrowedDeadline: pSource.borrowedDeadline
            }
          });

          if (existingTarget) {
            await tx.demandMaterial.update({
              where: { id: existingTarget.id },
              data: { quantity: existingTarget.quantity + pSource.quantity }
            });
            await tx.demandMaterial.delete({
              where: { id: pSource.id }
            });
          } else {
            await tx.demandMaterial.update({
              where: { id: pSource.id },
              data: { materialId: targetId }
            });
          }
        }

        // 2. UsedMaterial (used)
        const usedSources = await tx.usedMaterial.findMany({
          where: { materialId: sourceId }
        });

        for (const uSource of usedSources) {
          const existingTarget = await tx.usedMaterial.findFirst({
            where: {
              demandId: uSource.demandId,
              materialId: targetId
            }
          });

          if (existingTarget) {
            await tx.usedMaterial.update({
              where: { id: existingTarget.id },
              data: { quantity: existingTarget.quantity + uSource.quantity }
            });
            await tx.usedMaterial.delete({
              where: { id: uSource.id }
            });
          } else {
            await tx.usedMaterial.update({
              where: { id: uSource.id },
              data: { materialId: targetId }
            });
          }
        }

        // 3. ReturnedMaterial (returned)
        const returnedSources = await tx.returnedMaterial.findMany({
          where: { materialId: sourceId }
        });

        for (const rSource of returnedSources) {
          const existingTarget = await tx.returnedMaterial.findFirst({
            where: {
              demandId: rSource.demandId,
              materialId: targetId,
              type: rSource.type,
              isReturned: rSource.isReturned
            }
          });

          if (existingTarget) {
            await tx.returnedMaterial.update({
              where: { id: existingTarget.id },
              data: { quantity: existingTarget.quantity + rSource.quantity }
            });
            await tx.returnedMaterial.delete({
              where: { id: rSource.id }
            });
          } else {
            await tx.returnedMaterial.update({
              where: { id: rSource.id },
              data: { 
                materialId: targetId,
                materialName: targetMaterial.name
              }
            });
          }
        }

        // 4. Update composite materials components
        const materials = await tx.material.findMany();

        for (const mat of materials) {
          let comps = mat.components;
          if (comps) {
            if (typeof comps === 'string') {
              try {
                comps = JSON.parse(comps);
              } catch (e) {
                comps = null;
              }
            }
            if (Array.isArray(comps)) {
              let updated = false;
              const newCompsMap: Record<string, number> = {};

              for (const comp of (comps as any[])) {
                const mId = comp.materialId;
                const qty = comp.quantity;
                if (mId === sourceId) {
                  newCompsMap[targetId] = (newCompsMap[targetId] || 0) + qty;
                  updated = true;
                } else {
                  newCompsMap[mId] = (newCompsMap[mId] || 0) + qty;
                }
              }

              if (updated) {
                const finalComps = Object.entries(newCompsMap).map(([mId, qty]) => ({
                  materialId: mId,
                  quantity: qty
                }));
                await tx.material.update({
                  where: { id: mat.id },
                  data: { components: finalComps }
                });
              }
            }
          }
        }

        // 5. Delete source material
        await tx.material.delete({
          where: { id: sourceId }
        });

        // 6. Audit logging
        await AuditService.log('MERGE', 'MATERIAL', req.user!.id, targetId, {
          sourceId,
          sourceName: sourceMaterial.name,
          targetId,
          targetName: targetMaterial.name
        }, tx);
      }, {
        maxWait: 10000,
        timeout: 35000
      });

      res.json({ success: true, message: 'Materiais fundidos com sucesso' });
    } catch (error) {
      console.error('Error merging materials:', error);
      res.status(500).json({ error: 'Erro interno do servidor ao fundir materiais' });
    }
  }
}
