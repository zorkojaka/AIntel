import { Router } from 'express';
import { getCompanyDashboard, getInstallerDashboard, getStats } from '../controllers/dashboardController';
import { requireRoles } from '../../../middlewares/auth';
import { ROLE_ADMIN, ROLE_ORGANIZER } from '../../../utils/roles';

const router = Router();

router.get('/stats', getStats);
router.get('/installer', getInstallerDashboard);
// Urnik celotnega podjetja — samo vodstvo in organizator.
router.get('/company', requireRoles([ROLE_ADMIN, ROLE_ORGANIZER]), getCompanyDashboard);

export default router;
