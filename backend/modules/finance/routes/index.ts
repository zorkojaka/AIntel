import { Router } from 'express';
import {
  addFromInvoice,
  getClientFinance,
  getProjectFinance,
  getYearlySummary,
  listFinanceEntries,
} from '../controllers/financeController';

const router = Router();

router.get('/', listFinanceEntries);
router.post('/addFromInvoice', addFromInvoice);
router.get('/yearly-summary', getYearlySummary);
router.get('/project/:id', getProjectFinance);
router.get('/client/:id', getClientFinance);

export default router;
