import { Router } from 'express';
import dashboardRoutes from './modules/dashboard/routes';
import crmRoutes from './modules/crm/routes';
import cenikRoutes from './modules/cenik/routes/cenik.routes';
import priceListRoutes from './modules/cenik/routes/price-list.routes';
import settingsRoutes from './modules/settings/routes/settings.routes';
import financeRoutes from './modules/finance/routes';
import categoriesRoutes from './modules/categories/routes';
import projectsRoutes from './modules/projects/routes';
import requirementTemplatesRoutes from './modules/requirement-templates/routes';
import employeesRoutes from './modules/employees/routes/employees.routes';
import usersRoutes from './modules/users/routes/users.routes';
import pdfSettingsRoutes from './modules/projects/routes/pdf-settings.routes';
import offerPreviewRoutes from './modules/projects/routes/offer-preview.routes';

const router = Router();

router.use('/dashboard', dashboardRoutes);
router.use('/crm', crmRoutes);
router.use('/cenik', cenikRoutes);
router.use('/price-list', priceListRoutes);
router.use('/settings', settingsRoutes);
router.use('/settings', pdfSettingsRoutes);
router.use('/finance', financeRoutes);
router.use('/categories', categoriesRoutes);
router.use('/projects', projectsRoutes);
router.use('/requirement-templates', requirementTemplatesRoutes);
router.use('/employees', employeesRoutes);
router.use('/users', usersRoutes);
router.use('/offers', offerPreviewRoutes);

router.get('/', (_req, res) => {
  res.success({ status: 'AIntel CORE backend pripravljen' });
});

export default router;
