import { Router } from 'express';
import { ToolController } from '../controllers/ToolController.ts';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.ts';

const router = Router();

router.get('/', authMiddleware, ToolController.getAll);
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), ToolController.create);
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), ToolController.update);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), ToolController.delete);

export { router as toolRouter };
