import { Router } from 'express';
import { requireRoles } from '../../../middlewares/auth';
import { PRICE_ROLES } from '../../../utils/roles';
import { getOfferPdfPreviewController } from '../controllers/pdf-settings.controller';
import { parseOfferImport } from '../controllers/offer-version.controller';

const router = Router();
// Monter in organizator ne vidita cen ponudbe.
router.use(requireRoles(PRICE_ROLES));

router.get('/:offerVersionId/pdf-preview', getOfferPdfPreviewController);
router.post('/import/parse', parseOfferImport);

export default router;
