import { Router } from 'express';
import { UserController } from '../controllers/UserController.ts';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.middleware.ts';

const userRouter = Router();

userRouter.use(authMiddleware as any);
userRouter.use(adminMiddleware as any);

userRouter.get('/', UserController.getAll as any);
userRouter.get('/pending', UserController.getPending as any);
userRouter.patch('/:userId/approve', UserController.approve as any);
userRouter.delete('/:userId', UserController.delete as any);

export { userRouter };
