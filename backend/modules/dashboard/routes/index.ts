import { Router } from 'express';
import { getInstallerDashboard, getStats } from '../controllers/dashboardController';

const router = Router();

router.get('/stats', getStats);
router.get('/installer', getInstallerDashboard);

export default router;
