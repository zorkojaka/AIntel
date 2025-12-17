import { Router } from 'express';
import { getOfferPdfPreviewController } from '../controllers/pdf-settings.controller';

const router = Router();

router.get('/:offerVersionId/pdf-preview', getOfferPdfPreviewController);

export default router;
