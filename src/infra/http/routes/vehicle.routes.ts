import { Router } from 'express';
import { VehicleController } from '../controllers/VehicleController.ts';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.ts';

const router = Router();

router.get('/', authMiddleware, VehicleController.getAll);
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), VehicleController.create);
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), VehicleController.update);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), VehicleController.delete);

export { router as vehicleRouter };
