import { Router } from 'express';
import { requireRoles } from '../../../middlewares/auth';
import { ROLE_ADMIN } from '../../../utils/roles';
import {
  getPdfCompanySettingsController,
  getPdfDocumentSettingsController,
  getInvoiceCounterController,
  updatePdfCompanySettingsController,
  updatePdfDocumentSettingsController,
  updateInvoiceCounterController,
} from '../controllers/pdf-settings.controller';

const router = Router();

router.get('/company', getPdfCompanySettingsController);
router.put('/company', requireRoles([ROLE_ADMIN]), updatePdfCompanySettingsController);
router.get('/pdf-documents', getPdfDocumentSettingsController);
router.put('/pdf-documents', requireRoles([ROLE_ADMIN]), updatePdfDocumentSettingsController);
router.get('/invoice-counter', getInvoiceCounterController);
router.put('/invoice-counter', requireRoles([ROLE_ADMIN]), updateInvoiceCounterController);

export default router;
