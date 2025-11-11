import { Router } from 'express';
import dashboardRoutes from './modules/dashboard/routes';

const router = Router();

router.use('/dashboard', dashboardRoutes);

router.get('/', (_req, res) => {
  res.success({ status: 'AIntel CORE backend pripravljen' });
});

export default router;
