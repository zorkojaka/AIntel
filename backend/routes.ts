import { Router } from 'express';
import dashboardRoutes from './modules/dashboard/routes';
import crmRoutes from './modules/crm/routes';
import cenikRoutes from './modules/cenik/routes/cenik.routes';
import settingsRoutes from './modules/settings/routes/settings.routes';
import financeRoutes from './modules/finance/routes';
import categoriesRoutes from './modules/categories/routes';
import projectsRoutes from './modules/projects/routes';

const router = Router();

router.use('/dashboard', dashboardRoutes);
router.use('/crm', crmRoutes);
router.use('/cenik', cenikRoutes);
router.use('/settings', settingsRoutes);
router.use('/finance', financeRoutes);
router.use('/categories', categoriesRoutes);
router.use('/projects', projectsRoutes);

router.get('/', (_req, res) => {
  res.success({ status: 'AIntel CORE backend pripravljen' });
});

export default router;
