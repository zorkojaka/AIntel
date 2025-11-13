import { Router } from 'express';
import dashboardRoutes from './modules/dashboard/routes';
import crmRoutes from './modules/crm/routes';
<<<<<<< ours
import cenikRoutes from './modules/cenik/routes/cenik.routes';
import settingsRoutes from './modules/settings/routes/settings.routes';
=======
import financeRoutes from './modules/finance/routes';
>>>>>>> theirs

const router = Router();

router.use('/dashboard', dashboardRoutes);
router.use('/crm', crmRoutes);
<<<<<<< ours
router.use('/cenik', cenikRoutes);
router.use('/settings', settingsRoutes);
=======
router.use('/finance', financeRoutes);
>>>>>>> theirs

router.get('/', (_req, res) => {
  res.success({ status: 'AIntel CORE backend pripravljen' });
});

export default router;
