import { Router } from 'express';
import { ReportController } from '../controllers/ReportController.ts';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.middleware.ts';

const reportRouter = Router();

reportRouter.use(authMiddleware as any);
reportRouter.use(adminMiddleware as any);

reportRouter.get('/data', ReportController.getReportData as any);
reportRouter.get('/periods', ReportController.getAvailablePeriods as any);
reportRouter.get('/history', ReportController.listReportsHistory as any);
reportRouter.post('/save', ReportController.saveReport as any);
reportRouter.delete('/:id', ReportController.deleteReport as any);
reportRouter.get('/download/pdf', ReportController.downloadPdf as any);
reportRouter.get('/download/docx', ReportController.downloadDocx as any);

export { reportRouter };
