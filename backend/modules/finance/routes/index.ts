import { Router } from 'express';
import {
  addFromInvoice,
  getClientFinance,
  getProjectFinance,
  getYearlySummary,
  listFinanceEntries,
} from '../controllers/financeController';
import {
  employeesSummary,
  invoicesSummary,
  monthlySummary,
  projectsSummary,
} from '../controllers/finance-analytics.controller';

const router = Router();

router.get('/', listFinanceEntries);
router.post('/addFromInvoice', addFromInvoice);
router.get('/yearly-summary', getYearlySummary);
router.get('/project/:id', getProjectFinance);
router.get('/client/:id', getClientFinance);
router.get('/projects-summary', projectsSummary);
router.get('/monthly-summary', monthlySummary);
router.get('/employees-summary', employeesSummary);
router.get('/invoices', invoicesSummary);

export default router;
