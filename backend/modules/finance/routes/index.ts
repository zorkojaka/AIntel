import { Router } from 'express';
import { requireRoles } from '../../../middlewares/auth';
import { ROLE_ADMIN, ROLE_FINANCE } from '../../../utils/roles';
import {
  addFromInvoice,
  getClientFinance,
  getProjectFinance,
  getYearlySummary,
  listFinanceEntries,
} from '../controllers/financeController';
import {
  basketAnalysis,
  employeeProjectEarningDetail,
  employeesSummary,
  invoicesList,
  monthlySummary,
  myEarnings,
  myEarningsForecast,
  pipelineSummary,
  productBundles,
  productCooccurrence,
  productFrequency,
  snapshotByProject,
  snapshotsList,
  updateEmployeeProjectEarningPayment,
} from '../controllers/finance-analytics.controller';

const router = Router();
const companyFinance = requireRoles([ROLE_ADMIN, ROLE_FINANCE]);

router.get('/my/earnings', myEarnings);
router.get('/my/earnings-forecast', myEarningsForecast);

router.get('/', companyFinance, listFinanceEntries);
router.post('/addFromInvoice', companyFinance, addFromInvoice);
router.get('/yearly-summary', companyFinance, getYearlySummary);
router.get('/project/:id', companyFinance, getProjectFinance);
router.get('/client/:id', companyFinance, getClientFinance);

router.get('/snapshots', companyFinance, snapshotsList);
router.get('/invoices', companyFinance, invoicesList);
router.get('/snapshots/:projectId', companyFinance, snapshotByProject);
router.get('/monthly-summary', companyFinance, monthlySummary);
router.get('/product-frequency', companyFinance, productFrequency);
router.get('/basket-analysis', companyFinance, basketAnalysis);
router.get('/employees-summary', companyFinance, employeesSummary);
router.get('/employees/:employeeId/snapshots/:snapshotId/earnings', employeeProjectEarningDetail);
router.patch('/employees/:employeeId/snapshots/:snapshotId/payment', companyFinance, updateEmployeeProjectEarningPayment);
router.get('/pipeline', companyFinance, pipelineSummary);
router.get('/analytics/product-cooccurrence', companyFinance, productCooccurrence);
router.get('/analytics/product-bundles', companyFinance, productBundles);

export default router;
