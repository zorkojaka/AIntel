import { Router } from 'express';
import dashboardRoutes from './modules/dashboard/routes';
import crmRoutes from './modules/crm/routes';
import financeRoutes from './modules/finance/routes';

const router = Router();

router.use('/dashboard', dashboardRoutes);
router.use('/crm', crmRoutes);
router.use('/finance', financeRoutes);

router.get('/', (_req, res) => {
  res.success({ status: 'AIntel CORE backend pripravljen' });
});

export default router;
