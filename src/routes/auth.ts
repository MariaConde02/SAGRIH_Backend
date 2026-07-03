import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/login', authController.login);
router.post('/register', authController.register);
router.get('/me', authController.me);
router.post('/change-password', authMiddleware, authController.changePassword);
router.post('/recover-password', authController.recoverPassword);

export default router;
