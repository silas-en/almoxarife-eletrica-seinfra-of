import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import { StorageService } from '../../storage/StorageService.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { AuditService } from '../../database/audit.ts';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import axios from 'axios';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function parseDateAtNoon(dateInput: string | Date | undefined | null): Date {
  if (!dateInput) return new Date();
  let baseDateStr = typeof dateInput === 'string' ? dateInput : new Date(dateInput).toISOString();
  const matchYMD = baseDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchYMD) {
    return new Date(`${matchYMD[1]}-${matchYMD[2]}-${matchYMD[3]}T12:00:00`);
  }
  return new Date();
}

async function recalculateNotUsedReturns(demandId: string, tx: any) {
  const demand = await tx.demand.findUnique({
    where: { id: demandId },
    include: {
      plannedMaterials: true,
      usedMaterials: true
    }
  });
  if (!demand) return;

  // Delete all current NOT_USED returns that are NOT yet visually cleared/returned (isReturned: false)
  await tx.returnedMaterial.deleteMany({
    where: {
      demandId,
      type: 'NOT_USED',
      isReturned: false
    }
  });

  // Check if NOT_USED returns are eligible to be created:
  // Either the status is PENDING_APPROVAL/CONCLUDED, OR the materials have already been delivered (materialsDelivered is true)
  const isEligible = demand.materialsDelivered || demand.status === 'CONCLUDED' || demand.status === 'PENDING_APPROVAL';
  
  if (isEligible) {
    for (const planned of demand.plannedMaterials) {
      const used = demand.usedMaterials.find((u: any) => u.materialId === planned.materialId);
      const usedQty = used ? used.quantity : 0;
      const notUsedQty = planned.quantity - usedQty;

      if (notUsedQty > 0) {
        // Check if this material has already been marked as returned (isReturned = true)
        const alreadyReturned = await tx.returnedMaterial.findFirst({
          where: {
            demandId,
            materialId: planned.materialId,
            type: 'NOT_USED',
            isReturned: true
          }
        });

        if (!alreadyReturned) {
          await tx.returnedMaterial.create({
            data: {
              demandId,
              materialId: planned.materialId,
              quantity: notUsedQty,
              type: 'NOT_USED',
              isReturned: false
            }
          });
        }
      }
    }
  }
}

function getOrdinalPortuguese(n: number): string {
  const ordinals = [
    'primeira', 'segunda', 'terceira', 'quarta', 'quinta',
    'sexta', 'sétima', 'oitava', 'nona', 'décima',
    'décima primeira', 'décima segunda', 'décima terceira', 'décima quarta', 'décima quinta',
    'décima sexta', 'décima sétima', 'décima oitava', 'décima nona', 'vigésima'
  ];
  if (n >= 1 && n <= ordinals.length) {
    return ordinals[n - 1];
  }
  return `${n}ª`;
}

function appendOrdinalToDescription(fullDescription: string, index: number): string {
  const base = fullDescription.split('###REF_PHOTO:')[0] || '';
  const ref = fullDescription.includes('###REF_PHOTO:') ? '###REF_PHOTO:' + fullDescription.split('###REF_PHOTO:')[1] : '';
  const ordinalWord = getOrdinalPortuguese(index);
  const suffix = ` - ${ordinalWord} demanda para o mesmo local`;
  return `${base}${suffix}${ref}`;
}

async function handleDemandExecutionSplitting(demandId: string, tx: any): Promise<string[]> {
  const demand = await tx.demand.findUnique({
    where: { id: demandId },
    include: {
      electricians: true,
      plannedMaterials: true,
      usedMaterials: true,
      returnedMaterials: true,
    }
  });

  const processedIds: string[] = [demandId];

  if (!demand) return processedIds;
  if (demand.repetition <= 1) return processedIds;

  const totalRepetitions = demand.repetition;

  // 1. Update the original/main demand: set repetition to 1, since it is now approved and split.
  await tx.demand.update({
    where: { id: demandId },
    data: { repetition: 1 }
  });

  // 2. Create totalRepetitions - 1 cloned demands with status CONCLUDED and appropriate descriptions
  for (let i = 2; i <= totalRepetitions; i++) {
    const newDescription = appendOrdinalToDescription(demand.description, i);
    
    const clone = await tx.demand.create({
      data: {
        date: demand.date,
        description: newDescription,
        location: demand.location,
        googleMapsUrl: demand.googleMapsUrl,
        clientNumber: demand.clientNumber,
        status: 'CONCLUDED',
        materialsDelivered: demand.materialsDelivered,
        excludeFromSeparation: demand.excludeFromSeparation,
        photoUrl: demand.photoUrl,
        transformerNumber: demand.transformerNumber,
        observation: demand.observation,
        vehicles: demand.vehicles,
        tools: demand.tools,
        isPriority: demand.isPriority,
        priorityExecutionDate: demand.priorityExecutionDate,
        createdById: demand.createdById,
        repetition: 1, // each clone has repetition 1
        electricians: {
          connect: demand.electricians.map((e: any) => ({ id: e.id }))
        },
        plannedMaterials: {
          create: demand.plannedMaterials.map((pm: any) => ({
            materialId: pm.materialId,
            quantity: pm.quantity,
            borrowed: pm.borrowed,
            borrowedDeadline: pm.borrowedDeadline
          }))
        },
        usedMaterials: {
          create: demand.usedMaterials.map((um: any) => ({
            materialId: um.materialId,
            quantity: um.quantity
          }))
        },
        returnedMaterials: {
          create: demand.returnedMaterials.map((rm: any) => ({
            materialId: rm.materialId,
            materialName: rm.materialName,
            quantity: rm.quantity,
            type: rm.type,
            isReturned: rm.isReturned,
            date: rm.date
          }))
        }
      }
    });

    processedIds.push(clone.id);

    await AuditService.log('CREATE_CLONE_CONCLUDED', 'DEMAND', demand.createdById, clone.id, {
      originalId: demandId,
      location: clone.location,
      description: clone.description
    }, tx);
  }

  return processedIds;
}

export async function handleExclusiveMaterialSplitting(demandId: string, tx: any) {
  const demand = await tx.demand.findUnique({
    where: { id: demandId },
    include: {
      electricians: true,
      plannedMaterials: true,
      usedMaterials: {
        include: {
          material: true
        }
      },
      returnedMaterials: true,
    }
  });

  if (!demand) return;
  if (demand.status !== 'CONCLUDED') return;

  // Filter used materials to find any exclusive materials
  const exclusiveUsed = demand.usedMaterials.filter((um: any) => um.material && um.material.isExclusive);
  if (exclusiveUsed.length === 0) return;

  // Find the maximum quantity among exclusive materials used
  const maxQuantity = Math.max(...exclusiveUsed.map((um: any) => um.quantity));
  if (maxQuantity <= 1) return; // No split is needed

  // 1. Update the original/main demand:
  // - For each exclusive material: set its used quantity to 1 in the database
  // - Non-exclusive (common) materials are kept entirely on the first demand and remain untouched
  for (const um of exclusiveUsed) {
    await tx.usedMaterial.update({
      where: { id: um.id },
      data: { quantity: 1 }
    });
  }

  // 2. Create maxQuantity - 1 cloned demands (representing subsequent demands)
  for (let i = 2; i <= maxQuantity; i++) {
    const newDescription = appendOrdinalToDescription(demand.description, i);

    // Filter used materials for this clone:
    // - Exclusive materials: quantity is 1 if index i <= its original used quantity
    // - Non-exclusive (common) materials: not included at all on clones
    const clonedUsedMaterialsData: any[] = [];
    for (const um of exclusiveUsed) {
      if (i <= um.quantity) {
        clonedUsedMaterialsData.push({
          materialId: um.materialId,
          quantity: 1
        });
      }
    }

    const clone = await tx.demand.create({
      data: {
        date: demand.date,
        description: newDescription,
        location: demand.location,
        googleMapsUrl: demand.googleMapsUrl,
        clientNumber: demand.clientNumber,
        status: 'CONCLUDED',
        materialsDelivered: demand.materialsDelivered,
        excludeFromSeparation: demand.excludeFromSeparation,
        photoUrl: demand.photoUrl,
        transformerNumber: demand.transformerNumber,
        observation: demand.observation,
        vehicles: demand.vehicles,
        tools: demand.tools,
        isPriority: demand.isPriority,
        priorityExecutionDate: demand.priorityExecutionDate,
        createdById: demand.createdById,
        repetition: 1, // each clone has repetition 1
        electricians: {
          connect: demand.electricians.map((e: any) => ({ id: e.id }))
        },
        plannedMaterials: {
          create: [] // Clones do not have planned materials, displaying only used materials
        },
        usedMaterials: {
          create: clonedUsedMaterialsData
        },
        returnedMaterials: {
          create: [] // Clones do not have returned materials (no "relatório de retorno")
        }
      }
    });

    await AuditService.log('CREATE_CLONE_CONCLUDED', 'DEMAND', demand.createdById, clone.id, {
      originalId: demandId,
      location: clone.location,
      description: clone.description,
      reason: 'EXCLUSIVE_MATERIAL_SPLIT'
    }, tx);
  }
}

export async function processDemandPostApprovalOrConclusion(demandId: string, tx: any) {
  // Fetch the demand to check for exclusive materials with quantity > 1
  const demand = await tx.demand.findUnique({
    where: { id: demandId },
    include: {
      usedMaterials: {
        include: {
          material: true
        }
      }
    }
  });

  if (!demand) return;

  const exclusiveUsed = demand.usedMaterials.filter((um: any) => um.material && um.material.isExclusive);
  const maxExclusiveQuantity = exclusiveUsed.length > 0 
    ? Math.max(...exclusiveUsed.map((um: any) => um.quantity)) 
    : 0;

  let allIds: string[] = [];

  if (maxExclusiveQuantity > 1) {
    // If the demand is going to be split by exclusive materials (maxExclusiveQuantity > 1),
    // we bypass the repetition split completely to prevent the multiplier bug.
    // Reset repetition to 1 in the database for data integrity.
    await tx.demand.update({
      where: { id: demandId },
      data: { repetition: 1 }
    });
    allIds = [demandId];
  } else {
    // 1. Split by repetition first
    allIds = await handleDemandExecutionSplitting(demandId, tx);
  }

  // 2. For each resulting demand, check and split by exclusive materials
  for (const id of allIds) {
    await handleExclusiveMaterialSplitting(id, tx);
  }
}

export async function retroactiveSplitForExclusiveMaterial(materialId: string, tx: any) {
  const demandsToSplit = await tx.demand.findMany({
    where: {
      status: 'CONCLUDED',
      usedMaterials: {
        some: {
          materialId,
          quantity: { gt: 1 }
        }
      }
    },
    select: { id: true }
  });

  for (const d of demandsToSplit) {
    await handleExclusiveMaterialSplitting(d.id, tx);
  }
}

export class DemandController {
  static async reprocessExclusiveDemands(req: AuthRequest, res: Response) {
    try {
      // 1. Fetch all CONCLUDED demands with their details
      const demands = await prisma.demand.findMany({
        where: { status: 'CONCLUDED' },
        include: {
          electricians: { select: { id: true, name: true } },
          plannedMaterials: true,
          usedMaterials: {
            include: {
              material: true
            }
          },
          returnedMaterials: true,
        }
      });

      // Helper to clean description
      const cleanDescription = (desc: string): string => {
        const parts = desc.split('###REF_PHOTO:');
        const base = parts[0] || '';
        const ref = parts.length > 1 ? '###REF_PHOTO:' + parts.slice(1).join('###REF_PHOTO:') : '';
        const cleanedBase = base.replace(/\s*-\s*[^-\n]+?demanda para o mesmo local/gi, '').trim();
        return ref ? `${cleanedBase}${ref}` : cleanedBase;
      };

      // 2. Group demands by Date, Location and Cleaned Description
      const groups: Record<string, any[]> = {};
      for (const d of demands) {
        const dateKey = new Date(d.date).toISOString().split('T')[0];
        const locationKey = d.location.trim().toLowerCase();
        const cleanedDescKey = cleanDescription(d.description).trim().toLowerCase();
        
        const key = `${dateKey}_${locationKey}_${cleanedDescKey}`;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(d);
      }

      let healedCount = 0;
      let splitCount = 0;

      // 3. Process each group inside its own transaction to prevent transaction timeout
      for (const key of Object.keys(groups)) {
        const group = groups[key];
        
        // Check if any demand in the group contains exclusive materials in usedMaterials
        const hasExclusiveMaterial = group.some(d => 
          d.usedMaterials.some((um: any) => um.material && um.material.isExclusive)
        );

        if (!hasExclusiveMaterial) {
          // No exclusive materials used in this group, skip healing/re-splitting
          continue;
        }

        // We have exclusive materials in this group, let's heal it inside a dedicated transaction!
        await prisma.$transaction(async (tx) => {
          // Find the main demand of this group:
          // Preferably one that doesn't have "demanda para o mesmo local" in description
          const mainDemand = group.find((d: any) => !d.description.toLowerCase().includes('demanda para o mesmo local')) || group[0];
          const cloneDemands = group.filter((d: any) => d.id !== mainDemand.id);

          // Consolidate used materials
          const consolidatedUsed: Record<string, number> = {};
          
          // Add from mainDemand
          for (const um of mainDemand.usedMaterials) {
            consolidatedUsed[um.materialId] = (consolidatedUsed[um.materialId] || 0) + um.quantity;
          }
          
          // Add from clones
          for (const clone of cloneDemands) {
            for (const um of clone.usedMaterials) {
              consolidatedUsed[um.materialId] = (consolidatedUsed[um.materialId] || 0) + um.quantity;
            }
          }

          // Update mainDemand's description to the cleaned description
          const cleanedDesc = cleanDescription(mainDemand.description);
          await tx.demand.update({
            where: { id: mainDemand.id },
            data: { description: cleanedDesc }
          });

          // Delete all clone demands
          if (cloneDemands.length > 0) {
            await tx.demand.deleteMany({
              where: {
                id: { in: cloneDemands.map((c: any) => c.id) }
              }
            });
            healedCount += cloneDemands.length;
          }

          // Update mainDemand's usedMaterials quantities to consolidated sums
          for (const matId of Object.keys(consolidatedUsed)) {
            const qty = consolidatedUsed[matId];
            const existingUM = mainDemand.usedMaterials.find((um: any) => um.materialId === matId);
            
            if (existingUM) {
              await tx.usedMaterial.update({
                where: { id: existingUM.id },
                data: { quantity: qty }
              });
            } else {
              await tx.usedMaterial.create({
                data: {
                  demandId: mainDemand.id,
                  materialId: matId,
                  quantity: qty
                }
              });
            }
          }

          // Run the split algorithm on the healed mainDemand
          // First, fetch its updated used materials (since we just updated them in tx)
          const updatedMain = await tx.demand.findUnique({
            where: { id: mainDemand.id },
            include: {
              usedMaterials: {
                include: {
                  material: true
                }
              }
            }
          });

          if (updatedMain) {
            const exclusiveUsed = updatedMain.usedMaterials.filter((um: any) => um.material && um.material.isExclusive);
            if (exclusiveUsed.length > 0) {
              const maxQuantity = Math.max(...exclusiveUsed.map((um: any) => um.quantity));
              if (maxQuantity > 1) {
                // Run split!
                await handleExclusiveMaterialSplitting(updatedMain.id, tx);
                splitCount += (maxQuantity - 1);
              }
            }
          }
        }, { maxWait: 15000, timeout: 30000 });
      }

      res.json({ success: true, healedCount, splitCount });
    } catch (error) {
      console.error('[DemandController.reprocessExclusiveDemands] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { electricianId } = req.query;
      const where: any = {};
      
      if (req.user?.role === 'ELECTRICIAN') {
        where.electricians = {
          some: { id: req.user.id }
        };
      } else if (electricianId) {
        where.electricians = {
          some: { id: electricianId as string }
        };
      }

      const demands = await prisma.demand.findMany({
        where,
        include: {
          electricians: { select: { id: true, name: true } },
          plannedMaterials: { include: { material: true } },
          usedMaterials: { include: { material: true } },
          returnedMaterials: { include: { material: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json(demands.map(d => StorageService.mapDemand(d)));
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { date, description, location, googleMapsUrl, clientNumber, electricianIds, materials } = req.body;
      const repetition = Number(req.body.repetition) || 1;

      let parsedElectricianIds: string[] = [];
      if (electricianIds) {
        if (typeof electricianIds === 'string') {
          try {
            parsedElectricianIds = JSON.parse(electricianIds);
          } catch {
            parsedElectricianIds = electricianIds.split(',').map((id: string) => id.trim()).filter(Boolean);
          }
        } else if (Array.isArray(electricianIds)) {
          parsedElectricianIds = electricianIds;
        }
      }

      let parsedMaterials: any[] = [];
      if (materials) {
        if (typeof materials === 'string') {
          try {
            parsedMaterials = JSON.parse(materials);
          } catch {
            parsedMaterials = [];
          }
        } else if (Array.isArray(materials)) {
          parsedMaterials = materials;
        }
      }

      let referencePhotoUrl: string | null = null;
      if (req.file) {
        const fileKey = `demands/${Date.now()}-${req.file.originalname}`;
        referencePhotoUrl = await StorageService.uploadFile(
          'service-photos',
          fileKey,
          req.file.buffer,
          req.file.mimetype
        );
      }

      let dbDescription = description || '';
      if (referencePhotoUrl) {
        dbDescription = `${dbDescription}###REF_PHOTO:${referencePhotoUrl}`;
      }

      const isAdminUser = req.user?.role === 'ADMIN';
      const isPriorityParam = req.body.isPriority;
      const priorityExecutionDateParam = req.body.priorityExecutionDate;

      const isPriority = isAdminUser && (isPriorityParam === true || isPriorityParam === 'true');
      const priorityExecutionDate = isPriority && priorityExecutionDateParam ? parseDateAtNoon(priorityExecutionDateParam) : null;

      const demand = await prisma.$transaction(async (tx) => {
        const d = await tx.demand.create({
          data: {
            date: parseDateAtNoon(date),
            description: dbDescription,
            location,
            googleMapsUrl,
            clientNumber,
            isPriority,
            priorityExecutionDate,
            repetition,
            electricians: {
              connect: (parsedElectricianIds || []).map((id: string) => ({ id }))
            },
            createdById: req.user!.id,
            plannedMaterials: {
              create: (parsedMaterials || []).map((m: any) => ({
                materialId: m.materialId,
                quantity: Number(m.quantity),
                borrowed: m.borrowed === true || m.borrowed === 'true',
                borrowedDeadline: m.borrowedDeadline ? parseDateAtNoon(m.borrowedDeadline) : null,
              })),
            },
          },
        });
        await AuditService.log('CREATE', 'DEMAND', req.user!.id, d.id, { description, location }, tx);
        return d;
      }, { maxWait: 15000, timeout: 30000 });

      res.status(201).json(StorageService.mapDemand(demand));
    } catch (error) {
      console.error('[DemandController.create] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { 
        date, 
        description, 
        location, 
        googleMapsUrl,
        clientNumber, 
        electricianIds, 
        materials,
        transformerNumber,
        observation,
        vehicles,
        tools,
        usedMaterials,
        returnedMaterials,
        isPriority,
        priorityExecutionDate,
        repetition
      } = req.body;

      const isAdmin = req.user?.role === 'ADMIN';

      const existingDemand = await prisma.demand.findUnique({ where: { id } });
      if (!existingDemand) return res.status(404).json({ error: 'Demand not found' });

      if (!isAdmin && existingDemand.status === 'CONCLUDED') {
        return res.status(403).json({ error: 'Apenas administradores podem editar demandas finalizadas.' });
      }

      // Safe body parsers
      let parsedElectricianIds = electricianIds;
      if (typeof electricianIds === 'string') {
        try {
          parsedElectricianIds = JSON.parse(electricianIds);
        } catch {
          parsedElectricianIds = electricianIds.split(',').map((uid: string) => uid.trim()).filter(Boolean);
        }
      }

      let parsedMaterials = materials;
      if (typeof materials === 'string') {
        try {
          parsedMaterials = JSON.parse(materials);
        } catch {
          parsedMaterials = [];
        }
      }

      let parsedUsedMaterials = usedMaterials;
      if (typeof usedMaterials === 'string') {
        try {
          parsedUsedMaterials = JSON.parse(usedMaterials);
        } catch {
          parsedUsedMaterials = [];
        }
      }

      let parsedReturnedMaterials = returnedMaterials;
      if (typeof returnedMaterials === 'string') {
        try {
          parsedReturnedMaterials = JSON.parse(returnedMaterials);
        } catch {
          parsedReturnedMaterials = [];
        }
      }

      let baseDescription = description !== undefined ? description : existingDemand.description || '';
      if (baseDescription.includes('###REF_PHOTO:')) {
        baseDescription = baseDescription.split('###REF_PHOTO:')[0] || '';
      }

      let currentRefPhoto: string | null = null;
      if (existingDemand.description && existingDemand.description.includes('###REF_PHOTO:')) {
        currentRefPhoto = existingDemand.description.split('###REF_PHOTO:')[1] || null;
      }

      let finalReferencePhotoUrl = currentRefPhoto;
      if (req.file) {
        const fileKey = `demands/${Date.now()}-${req.file.originalname}`;
        finalReferencePhotoUrl = await StorageService.uploadFile(
          'service-photos',
          fileKey,
          req.file.buffer,
          req.file.mimetype
        );
      } else if (req.body.photoUrl === null || req.body.photoUrl === 'null' || req.body.referencePhotoUrl === null || req.body.referencePhotoUrl === 'null') {
        finalReferencePhotoUrl = null;
      }

      let dbDescription = baseDescription;
      if (finalReferencePhotoUrl) {
        dbDescription = `${baseDescription}###REF_PHOTO:${finalReferencePhotoUrl}`;
      }

      // Use dynamic data object
      const updateData: any = {
        date: date ? parseDateAtNoon(date) : undefined,
        description: dbDescription,
        location,
        googleMapsUrl,
        clientNumber,
      };

      if (repetition !== undefined) {
        updateData.repetition = Math.max(1, Number(repetition) || 1);
      }

      if (isAdmin) {
        if (isPriority !== undefined) {
          updateData.isPriority = isPriority === true || isPriority === 'true';
          if (!updateData.isPriority) {
            updateData.priorityExecutionDate = null;
          } else if (priorityExecutionDate !== undefined) {
            updateData.priorityExecutionDate = priorityExecutionDate ? parseDateAtNoon(priorityExecutionDate) : null;
          }
        } else if (priorityExecutionDate !== undefined) {
          updateData.priorityExecutionDate = priorityExecutionDate ? parseDateAtNoon(priorityExecutionDate) : null;
        }
      }

      if (parsedElectricianIds && isAdmin) {
        updateData.electricians = {
          set: parsedElectricianIds.map((uid: string) => ({ id: uid }))
        };
      }

      const isReturningToPending = existingDemand.status === 'PENDING_APPROVAL' && req.body.status === 'PENDING';
      
      const canEditCompletionFields = isAdmin || (existingDemand.status === 'PENDING_APPROVAL' && req.user?.role === 'ELECTRICIAN');

      if (isReturningToPending) {
        updateData.status = 'PENDING';
        updateData.photoUrl = null;
        updateData.transformerNumber = null;
        updateData.observation = null;
        updateData.vehicles = [];
        updateData.tools = [];
      } else if (req.body.status) {
        updateData.status = req.body.status;
      }

      if (canEditCompletionFields) {
        if (transformerNumber !== undefined) updateData.transformerNumber = transformerNumber;
        if (observation !== undefined) updateData.observation = observation;
        if (vehicles !== undefined) {
          updateData.vehicles = Array.isArray(vehicles) ? vehicles : (typeof vehicles === 'string' ? vehicles.split(',').map((v: string) => v.trim()).filter(Boolean) : []);
        }
        if (tools !== undefined) {
          updateData.tools = Array.isArray(tools) ? tools : (typeof tools === 'string' ? tools.split(',').map((v: string) => v.trim()).filter(Boolean) : []);
        }
      }

      const repCount = Number(repetition) || 1;

      await prisma.$transaction(async (tx) => {
        // Handlers for both Planned and Used materials
        let materialsChanged = false;

        // Handle Planned Materials
        if (parsedMaterials && (isAdmin || existingDemand.status === 'PENDING')) {
          await tx.demandMaterial.deleteMany({ where: { demandId: id } });
          await tx.demandMaterial.createMany({
            data: parsedMaterials.map((m: any) => ({
              demandId: id,
              materialId: m.materialId,
              quantity: Number(m.quantity) || 0,
              borrowed: m.borrowed === true || m.borrowed === 'true',
              borrowedDeadline: m.borrowedDeadline ? parseDateAtNoon(m.borrowedDeadline) : null,
            }))
          });
          materialsChanged = true;
        }

        // If returning to PENDING, clear used/returned materials
        if (isReturningToPending) {
          await tx.usedMaterial.deleteMany({ where: { demandId: id } });
          await tx.returnedMaterial.deleteMany({ where: { demandId: id } });
          materialsChanged = false; // No need to recalculate if cleared
        }

        // Handle Service Completion Fields
        if (canEditCompletionFields) {
          if (parsedUsedMaterials) {
            await tx.usedMaterial.deleteMany({ where: { demandId: id } });
            
            // Create used materials
            await tx.usedMaterial.createMany({
              data: parsedUsedMaterials.map((m: any) => ({
                demandId: id,
                materialId: m.materialId,
                quantity: Number(m.quantity) || 0,
              }))
            });
            materialsChanged = true;
          }

          if (materialsChanged && !isReturningToPending) {
            await recalculateNotUsedReturns(id, tx);
          }

          if (parsedReturnedMaterials) {
            // Delete and recreate DEFECTIVE and RECOVERED ones
            await tx.returnedMaterial.deleteMany({ 
              where: { 
                demandId: id, 
                type: { in: ['DEFECTIVE', 'RECOVERED'] } 
              } 
            });
            
            const returnedToCreate = parsedReturnedMaterials.map((m: any) => ({
              demandId: id,
              materialId: m.materialId,
              quantity: Number(m.quantity) || 0,
              type: m.type || 'DEFECTIVE'
            }));

            await tx.returnedMaterial.createMany({
              data: returnedToCreate
            });
          }
        }

        await tx.demand.update({
          where: { id },
          data: updateData,
        });

        const finalStatus = updateData.status || existingDemand.status;
        if (finalStatus === 'CONCLUDED') {
          await processDemandPostApprovalOrConclusion(id, tx);
        }
      }, { maxWait: 20000, timeout: 45000 });

      await AuditService.log('UPDATE', 'DEMAND', req.user!.id, id, { description, location });

      res.json({ message: 'Demand updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async finish(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { 
        usedMaterials, 
        replacedMaterials, 
        vehicles, 
        tools,
        transformerNumber, 
        observation 
      } = req.body;
      
      console.log(`[DemandController.finish] Body:`, req.body);
      
      const filesToProcess: any[] = [];
      if (req.file) {
        filesToProcess.push(req.file);
      }
      if (req.files && Array.isArray(req.files)) {
        filesToProcess.push(...req.files);
      }

      console.log(`[DemandController.finish] Processing ${filesToProcess.length} uploaded files`);

      let photoUrl = null;
      if (filesToProcess.length > 0) {
        const uploadedUrls: string[] = [];
        for (let i = 0; i < filesToProcess.length; i++) {
          const file = filesToProcess[i];
          const fileKey = `services/${id}/${Date.now()}-${i}-${file.originalname}`;
          const uploadedUrl = await StorageService.uploadFile(
            'service-photos',
            fileKey,
            file.buffer,
            file.mimetype
          );
          if (uploadedUrl) {
            uploadedUrls.push(uploadedUrl);
          }
        }
        if (uploadedUrls.length > 0) {
          photoUrl = uploadedUrls.join(',');
        }
      }

      const demand = await prisma.demand.findUnique({
        where: { id },
        include: { plannedMaterials: true }
      });

      if (!demand) return res.status(404).json({ error: 'Demand not found' });

      // Transactions to ensure atomicity
      await prisma.$transaction(async (tx) => {
        // 0. Clear existing completion data (if any) to allow for re-finishing (edits)
        await tx.usedMaterial.deleteMany({ where: { demandId: id } });
        await tx.returnedMaterial.deleteMany({ where: { demandId: id } });

        // 1. Mark as PENDING_APPROVAL
        const updateData: any = {
          status: 'PENDING_APPROVAL',
          transformerNumber,
          observation,
          vehicles: typeof vehicles === 'string' ? vehicles.split(',') : vehicles,
          tools: typeof tools === 'string' ? tools.split(',') : tools,
        };

        // Only update photoUrl if a new file was uploaded
        if (photoUrl) {
          updateData.photoUrl = photoUrl;
        }

        await tx.demand.update({
          where: { id },
          data: updateData
        });

        // 2. Record used materials
        const usedItems = JSON.parse(usedMaterials || '[]');
        if (usedItems.length > 0) {
          await tx.usedMaterial.createMany({
            data: usedItems.map((m: any) => ({
              demandId: id,
              materialId: m.materialId,
              quantity: Number(m.quantity) || 0,
            }))
          });
        }

        // 3. Record returned/defective materials
        const replacedItems = JSON.parse(replacedMaterials || '[]');
        if (replacedItems.length > 0) {
          await tx.returnedMaterial.createMany({
            data: replacedItems.map((m: any) => ({
              demandId: id,
              materialId: m.materialId,
              quantity: Number(m.quantity) || 0,
              type: 'DEFECTIVE'
            }))
          });
        }

        // 4. Calculate "Not Used" materials
        await recalculateNotUsedReturns(id, tx);
      }, { maxWait: 15000, timeout: 30000 });

      res.json({ message: 'Demand sent for approval' });
      
      await AuditService.log('FINISH', 'DEMAND', req.user!.id, id);
      console.log(`NOTIFICATION: Task ${id} marked as PENDING_APPROVAL by ${req.user!.name}. Admin notification sent.`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async approve(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.$transaction(async (tx) => {
        await tx.demand.update({
          where: { id },
          data: { status: 'CONCLUDED' }
        });

        await processDemandPostApprovalOrConclusion(id, tx);
      }, { maxWait: 20000, timeout: 45000 });

      await AuditService.log('APPROVE', 'DEMAND', req.user!.id, id);

      res.json({ message: 'Demand completion approved and moved to reports' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async bulkCreate(req: AuthRequest, res: Response) {
    try {
      const { demands } = req.body;
      
      const createdCount = await prisma.$transaction(async (tx) => {
        let count = 0;
        for (const item of demands) {
          await tx.demand.create({
            data: {
              date: parseDateAtNoon(item.date),
              description: item.description,
              location: item.location,
              clientNumber: item.clientNumber,
              electricians: {
                connect: Array.isArray(item.electricianIds) 
                  ? item.electricianIds.map((id: string) => ({ id }))
                  : (item.electricianId ? [{ id: item.electricianId }] : [])
              },
              createdById: req.user!.id,
              status: 'PENDING',
              plannedMaterials: item.materials && Array.isArray(item.materials) ? {
                create: item.materials.map((m: any) => ({
                  materialId: m.materialId,
                  quantity: Number(m.quantity) || 0,
                }))
              } : undefined
            }
          });
          count++;
        }
        return count;
      }, { maxWait: 20000, timeout: 45000 });

      await AuditService.log('BULK_CREATE', 'DEMAND', req.user!.id, null, { count: createdCount });

      res.status(201).json({ count: createdCount });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.demand.delete({ where: { id } });

      await AuditService.log('DELETE', 'DEMAND', req.user!.id, id);

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getPendingReturns(req: AuthRequest, res: Response) {
    try {
      const where: any = { type: 'NOT_USED', isReturned: false };
      
      if (req.user?.role === 'ELECTRICIAN') {
        where.demand = {
          electricians: {
            some: { id: req.user.id }
          }
        };
      }

      const returns = await prisma.returnedMaterial.findMany({
        where,
        include: {
          material: true,
          demand: {
            include: {
              electricians: { select: { id: true, name: true, username: true } }
            }
          }
        },
        orderBy: { date: 'desc' },
      });

      res.json(returns);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao buscar retornos pendentes.' });
    }
  }

  static async clearPendingReturn(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Apenas administradores podem dar baixa em materiais pendentes.' });
      }

      await prisma.returnedMaterial.update({
        where: { id },
        data: { isReturned: true }
      });

      await AuditService.log('UPDATE', 'RETURNED_MATERIAL_CLEAR', req.user.id, id, { isReturned: true });

      res.json({ message: 'Baixa efetuada com sucesso.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao dar baixa no material pendente.' });
    }
  }

  static async deliverMaterials(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Apenas administradores podem registrar entrega de materiais.' });
      }

      await prisma.$transaction(async (tx) => {
        // Mark as materials delivered
        await tx.demand.update({
          where: { id },
          data: { materialsDelivered: true }
        });

        // Compute and create initial NOT_USED entries
        await recalculateNotUsedReturns(id, tx);
      }, { maxWait: 15000, timeout: 30000 });

      await AuditService.log('UPDATE', 'DEMAND_MATERIALS_DELIVERED', req.user.id, id, { materialsDelivered: true });

      res.json({ message: 'Materiais da demanda entregues com sucesso!' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao registrar entrega dos materiais.' });
    }
  }

  static async revertDeliverMaterials(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Apenas administradores podem reverter entrega de materiais.' });
      }

      await prisma.$transaction(async (tx) => {
        // Mark as materials NOT delivered
        await tx.demand.update({
          where: { id },
          data: { materialsDelivered: false }
        });

        // Compute and delete initial NOT_USED entries
        await recalculateNotUsedReturns(id, tx);
      }, { maxWait: 15000, timeout: 30000 });

      await AuditService.log('UPDATE', 'DEMAND_MATERIALS_REVERTED', req.user!.id, id, { materialsDelivered: false });

      res.json({ message: 'Entrega dos materiais revertida com sucesso!' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao reverter entrega dos materiais.' });
    }
  }

  static async toggleExcludeSeparation(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Apenas administradores podem gerenciar kits de separação.' });
      }

      const demand = await prisma.demand.findUnique({ where: { id } });
      if (!demand) {
        return res.status(404).json({ error: 'Demanda não encontrada.' });
      }

      const updated = await prisma.demand.update({
        where: { id },
        data: { excludeFromSeparation: !demand.excludeFromSeparation }
      });

      await AuditService.log('UPDATE', 'DEMAND_EXCLUDE_SEPARATION', req.user.id, id, { excludeFromSeparation: updated.excludeFromSeparation });

      res.json({ 
        message: updated.excludeFromSeparation 
          ? 'Demanda excluída dos Kits de Separação com sucesso!' 
          : 'Demanda incluída nos Kits de Separação com sucesso!', 
        excludeFromSeparation: updated.excludeFromSeparation 
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao alterar a exclusão do kit de separação.' });
    }
  }

  static async getSeparationData(req: AuthRequest, res: Response) {
    try {
      const { electricianId } = req.query;

      // Determine target electrician
      let targetElectricianId = electricianId as string;
      if (req.user?.role === 'ELECTRICIAN') {
        targetElectricianId = req.user.id;
      }

      if (targetElectricianId) {
        // Fetch all pending demands to filter/consolidate in memory
        const allPendingDemands = await prisma.demand.findMany({
          where: {
            status: 'PENDING',
          },
          include: {
            plannedMaterials: {
              include: {
                material: true
              }
            },
            electricians: {
              select: { id: true, name: true, username: true }
            }
          },
          orderBy: { date: 'asc' }
        });

        const activePendingDemands = allPendingDemands.filter(d => !d.excludeFromSeparation);
        const inactivePendingDemands = allPendingDemands.filter(d => d.excludeFromSeparation);

        let demands: any[] = [];
        let excludedDemands: any[] = [];
        let electricians: any[] = [];

        if (targetElectricianId === 'unassigned') {
          demands = activePendingDemands.filter(d => !d.electricians || d.electricians.length === 0);
          excludedDemands = inactivePendingDemands.filter(d => !d.electricians || d.electricians.length === 0);
        } else if (targetElectricianId.includes('_')) {
          const targetIds = targetElectricianId.split('_');
          const targetSet = new Set(targetIds);
          demands = activePendingDemands.filter(d => {
            if (!d.electricians || d.electricians.length !== targetSet.size) return false;
            return d.electricians.every(e => targetSet.has(e.id));
          });
          excludedDemands = inactivePendingDemands.filter(d => {
            if (!d.electricians || d.electricians.length !== targetSet.size) return false;
            return d.electricians.every(e => targetSet.has(e.id));
          });

          electricians = await prisma.user.findMany({
            where: { id: { in: targetIds } },
            select: { id: true, name: true, username: true }
          });
          electricians.sort((a, b) => a.name.localeCompare(b.name));
        } else {
          // If a single ID is requested (like an individual logged-in electrician)
          demands = activePendingDemands.filter(d => d.electricians && d.electricians.some(e => e.id === targetElectricianId));
          excludedDemands = inactivePendingDemands.filter(d => d.electricians && d.electricians.some(e => e.id === targetElectricianId));
          const singleEleObj = await prisma.user.findUnique({
            where: { id: targetElectricianId },
            select: { id: true, name: true, username: true }
          });
          if (singleEleObj) {
            electricians = [singleEleObj];
          }
        }

        // Compute material totals
        const materialTotals: { [key: string]: { id: string; name: string; unit: string; quantity: number } } = {};
        demands.forEach(d => {
          const mats = d.plannedMaterials || [];
          mats.forEach(pm => {
            if (!pm.material) return;
            const matId = pm.material.id;
            if (!materialTotals[matId]) {
              materialTotals[matId] = {
                id: matId,
                name: pm.material.name,
                unit: pm.material.unit || 'un',
                quantity: 0
              };
            }
            materialTotals[matId].quantity += pm.quantity;
          });
        });

        const returnedElectrician = {
          id: targetElectricianId,
          name: electricians.map(e => e.name).join(' & ') || 'Sem Eletricista',
          username: electricians.map(e => e.username).join(', ') || 'sem_eletricista'
        };

        return res.json({
          electrician: returnedElectrician,
          demands: demands.map(d => StorageService.mapDemand(d)),
          excludedDemands: excludedDemands.map(d => StorageService.mapDemand(d)),
          totals: Object.values(materialTotals)
        });
      }

      // If no electricianId is specified and user is Admin, list ALL unique teams/duos who have PENDING demands
      if (req.user?.role === 'ADMIN') {
        const pendingDemands = await prisma.demand.findMany({
          where: { 
            status: 'PENDING',
          },
          select: {
            id: true,
            excludeFromSeparation: true,
            electricians: {
              select: { id: true, name: true, username: true }
            }
          }
        });

        const uniqueTeams: {
          [key: string]: {
            id: string;
            name: string;
            username: string;
            pendingDemandsCount: number;
            excludedDemandsCount: number;
          }
        } = {};

        pendingDemands.forEach(d => {
          const sortedEles = [...(d.electricians || [])].sort((a, b) => a.name.localeCompare(b.name));
          let teamId = '';
          let teamName = '';
          let teamUsername = '';

          if (sortedEles.length > 0) {
            teamId = sortedEles.map(e => e.id).join('_');
            teamName = sortedEles.map(e => e.name).join(' & ');
            teamUsername = sortedEles.map(e => e.username).join(', ');
          } else {
            teamId = 'unassigned';
            teamName = 'Sem Eletricista';
            teamUsername = 'sem_eletricista';
          }

          if (!uniqueTeams[teamId]) {
            uniqueTeams[teamId] = {
              id: teamId,
              name: teamName,
              username: teamUsername,
              pendingDemandsCount: 0,
              excludedDemandsCount: 0
            };
          }
          if (d.excludeFromSeparation) {
            uniqueTeams[teamId].excludedDemandsCount += 1;
          } else {
            uniqueTeams[teamId].pendingDemandsCount += 1;
          }
        });

        const mappedTeams = Object.values(uniqueTeams).sort((a, b) => a.name.localeCompare(b.name));
        return res.json({ electricians: mappedTeams });
      }

      return res.status(400).json({ error: 'Parâmetros inválidos.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao obter dados de separação.' });
    }
  }

  static async downloadSeparationPdf(req: AuthRequest, res: Response) {
    try {
      const { electricianId } = req.params;
      let targetId = electricianId;

      // An electrician is allowed to download if they are part of the duo/team
      if (req.user?.role === 'ELECTRICIAN' && !targetId.split('_').includes(req.user.id)) {
        return res.status(403).json({ error: 'Você não tem permissão para visualizar o kit de outro eletricista.' });
      }

      const allPendingDemands = await prisma.demand.findMany({
        where: {
          status: 'PENDING',
          excludeFromSeparation: false,
        },
        include: {
          plannedMaterials: {
            include: {
              material: true
            }
          },
          electricians: {
            select: { id: true, name: true, username: true }
          }
        },
        orderBy: { date: 'asc' }
      });

      let demands: any[] = [];
      let electricians: any[] = [];

      if (targetId === 'unassigned') {
        demands = allPendingDemands.filter(d => !d.electricians || d.electricians.length === 0);
      } else if (targetId.includes('_')) {
        const targetIds = targetId.split('_');
        const targetSet = new Set(targetIds);
        demands = allPendingDemands.filter(d => {
          if (!d.electricians || d.electricians.length !== targetSet.size) return false;
          return d.electricians.every(e => targetSet.has(e.id));
        });

        electricians = await prisma.user.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, name: true, username: true }
        });
        electricians.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        demands = allPendingDemands.filter(d => d.electricians && d.electricians.some(e => e.id === targetId));
        const singleEleObj = await prisma.user.findUnique({
          where: { id: targetId },
          select: { id: true, name: true, username: true }
        });
        if (singleEleObj) {
          electricians = [singleEleObj];
        }
      }

      if (demands.length === 0) {
        return res.status(400).json({ error: 'Esta equipe/dupla não possui nenhuma demanda pendente para separação.' });
      }

      const teamName = electricians.map(e => e.name).join(' & ') || 'Sem Eletricista';
      const teamUsername = electricians.map(e => e.username).join(', ') || 'sem_eletricista';

      const electrician = {
        name: teamName,
        username: teamUsername
      };

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      
      const pdfGenerationPromise = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', err => reject(err));
      });

      // --- RESOLVE FONTS PATH ---
      const isProd = process.env.NODE_ENV === 'production';
      const projectRoot = process.cwd();
      const fontsBaseDir = isProd 
        ? path.resolve(projectRoot, 'dist/assets/fonts')
        : path.resolve(projectRoot, 'src/assets/fonts');

      const regularPath = path.join(fontsBaseDir, 'Roboto-Regular.ttf');
      const boldPath = path.join(fontsBaseDir, 'Roboto-Bold.ttf');
      const italicPath = path.join(fontsBaseDir, 'Roboto-Italic.ttf');

      // Register fonts with PDFKit
      let fontRegular = 'Helvetica';
      let fontBold = 'Helvetica-Bold';
      let fontItalic = 'Helvetica-Oblique';

      if (fs.existsSync(regularPath) && fs.existsSync(boldPath) && fs.existsSync(italicPath)) {
        doc.registerFont('AppFont', regularPath);
        doc.registerFont('AppFont-Bold', boldPath);
        doc.registerFont('AppFont-Italic', italicPath);
        fontRegular = 'AppFont';
        fontBold = 'AppFont-Bold';
        fontItalic = 'AppFont-Italic';
      }

      // --- MUNICIPIO LOGO ---
      const [logoRes] = await Promise.allSettled([
        axios.get('https://i.postimg.cc/W3n0DdqH/pref-logo-sha.png', { responseType: 'arraybuffer', timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } })
      ]);

      // Header Banner
      doc.rect(0, 0, 612, 110).fill('#1e3a8a');
      if (logoRes.status === 'fulfilled') {
        try {
          doc.image(logoRes.value.data, 40, 20, { width: 100 });
        } catch (err) {
          console.error('[downloadSeparationPdf] Image parsing failed', err);
        }
      }

      doc.fillColor('#ffffff').font(fontBold).fontSize(16).text('KIT DE SEPARAÇÃO - ALMOXARIFADO', 160, 30);
      doc.fontSize(10).font(fontRegular).text('CONTROLE DE CARGA E SEPARAÇÃO POR ELETRICISTA', 160, 52);
      doc.fontSize(8.5).font(fontItalic).text('EMISSÃO COMPILADA DAS SOBRAS E PLANEJAMENTO DE SERVIÇO', 160, 68);

      doc.y = 130;

      // Meta Context Card
      const metaY = doc.y;
      doc.rect(40, metaY, 512, 70).fill('#f8fafc').stroke('#e2e8f0');
      doc.fillColor('#0f172a'); // slate-900

      doc.font(fontBold).fontSize(9.5).text('Eletricista:', 55, metaY + 12);
      doc.font(fontRegular).fontSize(9.5).text(electrician.name, 125, metaY + 12);

      doc.font(fontBold).fontSize(9.5).text('Usuário:', 55, metaY + 28);
      doc.font(fontRegular).fontSize(9.5).text(electrician.username, 125, metaY + 28);

      doc.font(fontBold).fontSize(9.5).text('Demanda(s):', 55, metaY + 44);
      doc.font(fontRegular).fontSize(9.5).text(`${demands.length} pendente(s) de execução`, 125, metaY + 44);

      doc.font(fontBold).fontSize(9.5).text('Data de Geração:', 300, metaY + 12);
      doc.font(fontRegular).fontSize(9.5).text(format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR }), 390, metaY + 12);

      doc.font(fontBold).fontSize(9.5).text('Finalidade:', 300, metaY + 28);
      doc.font(fontRegular).fontSize(9.5).text('Agrupamento para separação', 390, metaY + 28);

      doc.y = metaY + 95;

      // Section 1 Heading
      doc.fillColor('#1e293b').font(fontBold).fontSize(12).text('1. DETALHAMENTO DE MATERIAIS - POR DEMANDA', 40);
      doc.moveDown(0.3);
      doc.rect(40, doc.y, 512, 1.5).fill('#3b82f6');
      doc.moveDown(0.6);

      demands.forEach((d: any, idx: number) => {
        if (doc.y > 680) {
          doc.addPage();
        }

        const demandY = doc.y;
        doc.rect(40, demandY, 512, 22).fill('#eff6ff');
        doc.fillColor('#1d4ed8').font(fontBold).fontSize(9.5).text(`DEMANDA: ${d.location ? d.location.toUpperCase() : 'SEM LOCAL'}`, 50, demandY + 6);
        doc.fillColor('#475569').font(fontBold).fontSize(8.5).text(`DATA: ${format(new Date(d.date), 'dd/MM/yyyy', { locale: ptBR })}`, 440, demandY + 7);
        
        doc.y = demandY + 27;
        doc.fillColor('#334155').font(fontItalic).fontSize(8.5).text(`Descrição da Demanda: ${d.description || 'Sem descrição'}`, 50);
        doc.fillColor('#334155').font(fontRegular).fontSize(8.5).text(`Contato do Solicitante: ${d.clientNumber || 'Não informado'}`, 50);
        doc.moveDown(0.4);

        const mats = d.plannedMaterials || [];
        if (mats.length === 0) {
          doc.fillColor('#94a3b8').font(fontItalic).fontSize(8.5).text('Não há materiais planejados para esta demanda.', 60);
          doc.moveDown(0.8);
        } else {
          // Table Header
          const headerY = doc.y;
          doc.rect(50, headerY, 492, 16).fill('#f8fafc');
          doc.fillColor('#475569').font(fontBold).fontSize(8.5).text('Descrição do Material', 60, headerY + 4);
          doc.text('Unidade', 380, headerY + 4);
          doc.text('Quantidade', 450, headerY + 4);
          doc.y = headerY + 18;

          mats.forEach((pm: any) => {
            if (doc.y > 740) {
              doc.addPage();
            }
            const rowY = doc.y;
            doc.rect(50, rowY, 492, 16).fill('#ffffff');
            doc.fillColor('#0f172a').font(fontRegular).fontSize(8.5).text(pm.material?.name || 'Material sem nome', 60, rowY + 4);
            doc.fillColor('#475569').text(pm.material?.unit || 'un', 380, rowY + 4);
            doc.fillColor('#0f172a').font(fontBold).text(String(pm.quantity), 450, rowY + 4);
            doc.rect(50, rowY + 15, 492, 0.5).fill('#e2e8f0');
            doc.y = rowY + 17;
          });
          doc.moveDown(0.8);
        }
      });

      // Section 2 Heading: Consolidated Total
      doc.addPage();
      const summaryY = doc.y;
      doc.rect(40, summaryY, 512, 26).fill('#1e3a8a');
      doc.fillColor('#ffffff').font(fontBold).fontSize(11).text('2. RESUMO CONSOLIDADO DA CARGA (PARA SEPARAÇÃO)', 50, summaryY + 8);
      doc.y = summaryY + 34;

      doc.fillColor('#475569').font(fontRegular).fontSize(9).text('Este quadro exibe o somatório total de cada item necessário para a execução simultânea de todas as demandas pendentes deste eletricista, facilitando a separação física do kit no almoxarifado.', 40);
      doc.moveDown(0.8);

      // Compute static consolidation
      const consolidated: { [key: string]: { name: string; unit: string; qty: number } } = {};
      demands.forEach(d => {
        d.plannedMaterials?.forEach((pm: any) => {
          if (!pm.material) return;
          const matId = pm.material.id;
          if (!consolidated[matId]) {
            consolidated[matId] = {
              name: pm.material.name,
              unit: pm.material.unit || 'un',
              qty: 0
            };
          }
          consolidated[matId].qty += pm.quantity;
        });
      });

      const consolidatedList = Object.values(consolidated);

      const tableHeaderY = doc.y;
      doc.rect(40, tableHeaderY, 512, 18).fill('#eff6ff');
      doc.fillColor('#1e40af').font(fontBold).fontSize(8.5).text('Check', 48, tableHeaderY + 5);
      doc.text('Descrição do Material', 90, tableHeaderY + 5);
      doc.text('Unidade', 380, tableHeaderY + 5);
      doc.text('Separar (Total)', 450, tableHeaderY + 5);
      doc.y = tableHeaderY + 22;

      consolidatedList.forEach((item) => {
        if (doc.y > 740) {
          doc.addPage();
        }
        const rowY = doc.y;
        doc.rect(40, rowY, 512, 20).fill('#ffffff');
        
        // Draw comfortable checkbox
        doc.rect(50, rowY + 4, 10, 10).stroke('#94a3b8');

        doc.fillColor('#0f172a').font(fontRegular).fontSize(9).text(item.name, 90, rowY + 5);
        doc.fillColor('#475569').text(item.unit, 380, rowY + 5);
        doc.fillColor('#1d4ed8').font(fontBold).fontSize(9.5).text(String(item.qty), 450, rowY + 5);
        doc.rect(40, rowY + 19, 512, 0.5).fill('#e2e8f0');
        doc.y = rowY + 22;
      });

      doc.moveDown(2);
      
      if (doc.y > 650) {
        doc.addPage();
      }

      const sigY = doc.y + 40;
      doc.rect(50, sigY, 200, 0.7).fill('#94a3b8');
      doc.rect(340, sigY, 200, 0.7).fill('#94a3b8');
      
      doc.font(fontRegular).fillColor('#334155').fontSize(8);
      doc.text('Assinatura do Responsável (Separação)', 50, sigY + 5, { width: 200, align: 'center' });
      doc.text('Assinatura do Eletricista (Recebimento)', 340, sigY + 5, { width: 200, align: 'center' });

      doc.end();

      const finalBuffer = await pdfGenerationPromise;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Almoxarifado-Kit-${electrician.username}.pdf`);
      res.send(finalBuffer);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao gerar PDF de separação de kit.' });
    }
  }

  static async getBorrowedMaterials(req: AuthRequest, res: Response) {
    try {
      const items = await prisma.demandMaterial.findMany({
        where: {
          borrowed: true
        },
        include: {
          material: true,
          demand: {
            include: {
              electricians: { select: { id: true, name: true } }
            }
          }
        },
        orderBy: {
          borrowedDeadline: 'asc'
        }
      });
      res.json(items);
    } catch (error) {
      console.error('[DemandController.getBorrowedMaterials] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateDemandMaterial(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { borrowedDeadline, borrowed, quantity } = req.body;

      const demandMaterial = await prisma.demandMaterial.findUnique({
        where: { id }
      });

      if (!demandMaterial) {
        return res.status(404).json({ error: 'Demand material not found' });
      }

      const updateData: any = {};
      if (borrowedDeadline !== undefined) {
        updateData.borrowedDeadline = borrowedDeadline ? parseDateAtNoon(borrowedDeadline) : null;
      }
      if (borrowed !== undefined) {
        updateData.borrowed = borrowed;
      }
      if (quantity !== undefined) {
        updateData.quantity = Number(quantity);
      }

      const updated = await prisma.demandMaterial.update({
        where: { id },
        data: updateData,
        include: {
          material: true,
          demand: true
        }
      });

      // Log action
      await AuditService.log(
        'UPDATE', 
        'DEMAND_MATERIAL', 
        req.user!.id, 
        id, 
        { 
          borrowedDeadline, 
          borrowed, 
          materialName: updated.material.name, 
          demandId: updated.demandId 
        }
      );

      res.json(updated);
    } catch (error) {
      console.error('[DemandController.updateDemandMaterial] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
