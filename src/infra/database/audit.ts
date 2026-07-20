import prisma from './prisma.ts';

export class AuditService {
  static async log(action: string, entity: string, userId: string, entityId?: string, details?: any, tx?: any) {
    try {
      const client = tx || prisma;
      await client.auditLog.create({
        data: {
          action,
          entity,
          userId,
          entityId: entityId || null,
          details: details || null,
        },
      });
    } catch (error) {
      console.error('Failed to create audit log:', error);
    }
  }
}
