import { Router } from 'express';
import multer from 'multer';
import { DemandController } from '../controllers/DemandController.ts';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.middleware.ts';

const demandRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

demandRouter.use(authMiddleware as any);

demandRouter.get('/', DemandController.getAll as any);
demandRouter.get('/borrowed-materials', DemandController.getBorrowedMaterials as any);
demandRouter.patch('/demand-material/:id', adminMiddleware as any, DemandController.updateDemandMaterial as any);
demandRouter.get('/pending-returns', DemandController.getPendingReturns as any);
demandRouter.get('/separation/data', DemandController.getSeparationData as any);
demandRouter.get('/separation/pdf/:electricianId', DemandController.downloadSeparationPdf as any);
demandRouter.put('/pending-returns/:id/clear', adminMiddleware as any, DemandController.clearPendingReturn as any);
demandRouter.put('/:id/deliver-materials', adminMiddleware as any, DemandController.deliverMaterials as any);
demandRouter.put('/:id/revert-deliver-materials', adminMiddleware as any, DemandController.revertDeliverMaterials as any);
demandRouter.post('/', adminMiddleware as any, upload.single('photo'), DemandController.create as any);
demandRouter.put('/:id', adminMiddleware as any, upload.single('photo'), DemandController.update as any);
demandRouter.delete('/:id', adminMiddleware as any, DemandController.delete as any);
demandRouter.patch('/:id/approve', adminMiddleware as any, DemandController.approve as any);
demandRouter.patch('/:id/toggle-exclude-separation', adminMiddleware as any, DemandController.toggleExcludeSeparation as any);

demandRouter.post('/bulk', adminMiddleware as any, DemandController.bulkCreate as any);
demandRouter.post('/:id/finish', upload.any(), DemandController.finish as any);

export { demandRouter };
