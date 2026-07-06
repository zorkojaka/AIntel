import { Router } from 'express';
import { requireRoles } from '../../../middlewares/auth';
import { ROLE_ADMIN } from '../../../utils/roles';
import {
  getPdfCompanySettingsController,
  getPdfDocumentSettingsController,
  updatePdfCompanySettingsController,
  updatePdfDocumentSettingsController,
} from '../controllers/pdf-settings.controller';

const router = Router();

router.get('/company', getPdfCompanySettingsController);
router.put('/company', requireRoles([ROLE_ADMIN]), updatePdfCompanySettingsController);
router.get('/pdf-documents', getPdfDocumentSettingsController);
router.put('/pdf-documents', requireRoles([ROLE_ADMIN]), updatePdfDocumentSettingsController);

export default router;
