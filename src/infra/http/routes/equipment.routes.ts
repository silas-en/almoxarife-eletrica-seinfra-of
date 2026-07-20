import { Router } from 'express';
import multer from 'multer';
import { EquipmentController } from '../controllers/EquipmentController.ts';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.ts';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Equipments registration routes
router.get('/', authMiddleware, EquipmentController.getAllEquipments);
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), EquipmentController.createEquipment);
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), EquipmentController.updateEquipment);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), EquipmentController.deleteEquipment);

// Equipment deliveries routes
router.get('/deliveries', authMiddleware, EquipmentController.getAllDeliveries);
router.post('/deliveries', authMiddleware, roleMiddleware(['ADMIN']), EquipmentController.createDelivery);
router.put('/deliveries/:id', authMiddleware, roleMiddleware(['ADMIN']), EquipmentController.updateDelivery);
router.delete('/deliveries/:id', authMiddleware, roleMiddleware(['ADMIN']), EquipmentController.deleteDelivery);

export { router as equipmentRouter };
