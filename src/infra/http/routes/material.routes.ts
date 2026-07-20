import { Router } from 'express';
import multer from 'multer';
import { MaterialController } from '../controllers/MaterialController.ts';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.middleware.ts';

const materialRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

materialRouter.use(authMiddleware as any);

materialRouter.get('/', MaterialController.getAll as any);

materialRouter.post(
  '/merge',
  adminMiddleware as any,
  MaterialController.merge as any
);

materialRouter.post(
  '/', 
  adminMiddleware as any, 
  upload.single('image'), 
  MaterialController.create as any
);

materialRouter.put(
  '/:id', 
  adminMiddleware as any, 
  upload.single('image'), 
  MaterialController.update as any
);

materialRouter.delete(
  '/:id', 
  adminMiddleware as any, 
  MaterialController.delete as any
);

export { materialRouter };
