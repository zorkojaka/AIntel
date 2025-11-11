import { Router } from 'express';
import { getStats } from '../controllers/dashboardController';

const router = Router();

router.get('/stats', getStats);

export default router;
