import { Router } from 'express';
import multer from 'multer';
import { CIController } from '../controllers/CIController.ts';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.ts';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authMiddleware, CIController.getAllCIs);
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), upload.single('file'), CIController.createCI);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), CIController.deleteCI);

export { router as ciRouter };
