import { Router } from 'express';
import {
  addFromInvoice,
  getClientFinance,
  getProjectFinance,
  getYearlySummary,
  listFinanceEntries,
} from '../controllers/financeController';
import {
  basketAnalysis,
  employeesSummary,
  monthlySummary,
  pipelineSummary,
  productFrequency,
  snapshotByProject,
  snapshotsList,
} from '../controllers/finance-analytics.controller';

const router = Router();

router.get('/', listFinanceEntries);
router.post('/addFromInvoice', addFromInvoice);
router.get('/yearly-summary', getYearlySummary);
router.get('/project/:id', getProjectFinance);
router.get('/client/:id', getClientFinance);

router.get('/snapshots', snapshotsList);
router.get('/snapshots/:projectId', snapshotByProject);
router.get('/monthly-summary', monthlySummary);
router.get('/product-frequency', productFrequency);
router.get('/basket-analysis', basketAnalysis);
router.get('/employees-summary', employeesSummary);
router.get('/pipeline', pipelineSummary);

export default router;
