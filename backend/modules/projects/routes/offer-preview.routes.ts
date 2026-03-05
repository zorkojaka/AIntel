import { Router } from 'express';
import { getOfferPdfPreviewController } from '../controllers/pdf-settings.controller';
import { parseOfferImport } from '../controllers/offer-version.controller';

const router = Router();

router.get('/:offerVersionId/pdf-preview', getOfferPdfPreviewController);
router.post('/import/parse', parseOfferImport);

export default router;
