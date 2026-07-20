import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { AuditService } from '../../database/audit.ts';
import { StorageService } from '../../storage/StorageService.ts';

export class CIController {
  static async getAllCIs(req: AuthRequest, res: Response) {
    try {
      const documents = await prisma.document.findMany({
        orderBy: { uploadedAt: 'desc' },
      });
      
      const mappedCIs = documents.map(doc => ({
        ...doc,
        fileUrl: StorageService.getFileUrl(doc.fileUrl),
      }));

      res.json(mappedCIs);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao buscar comunicações internas.' });
    }
  }

  static async createCI(req: AuthRequest, res: Response) {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'O nome do documento é obrigatório.' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      }

      // Check if file is PDF
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'Apenas arquivos PDF são permitidos.' });
      }

      const fileKey = `documents/${Date.now()}-${req.file.originalname}`;
      const fileUrl = await StorageService.uploadFile(
        'documents',
        fileKey,
        req.file.buffer,
        req.file.mimetype
      );

      const document = await prisma.document.create({
        data: {
          name,
          fileUrl,
        },
      });

      await AuditService.log('CREATE', 'DOCUMENT', req.user!.id, document.id, { name, fileUrl });

      res.status(201).json({
        ...document,
        fileUrl: StorageService.getFileUrl(document.fileUrl),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao fazer upload da comunicação interna.' });
    }
  }

  static async deleteCI(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.document.delete({ where: { id } });

      await AuditService.log('DELETE', 'DOCUMENT', req.user!.id, id);
      res.status(204).send();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao excluir comunicação interna.' });
    }
  }
}
