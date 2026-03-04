import { Router } from 'express';
import {
  getPdfCompanySettingsController,
  getPdfDocumentSettingsController,
  updatePdfCompanySettingsController,
  updatePdfDocumentSettingsController,
} from '../controllers/pdf-settings.controller';

const router = Router();

router.get('/company', getPdfCompanySettingsController);
router.put('/company', updatePdfCompanySettingsController);
router.get('/pdf-documents', getPdfDocumentSettingsController);
router.put('/pdf-documents', updatePdfDocumentSettingsController);

export default router;
