import { Router } from 'express';
import { RecoveredController } from '../controllers/RecoveredController.ts';

const recoveredRouter = Router();
const controller = new RecoveredController();

recoveredRouter.get('/', controller.list);
recoveredRouter.post('/', controller.create);
recoveredRouter.put('/:id', controller.update);
recoveredRouter.delete('/:id', controller.delete);

export { recoveredRouter };
