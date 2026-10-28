import { Router } from 'express';
import { requireRoles } from '../../../middlewares/auth';
import { ROLE_ADMIN, ROLE_FINANCE, ROLE_ORGANIZER, ROLE_SALES } from '../../../utils/roles';
import { getOfferPdfPreviewController } from '../controllers/pdf-settings.controller';
import { parseOfferImport } from '../controllers/offer-version.controller';

const router = Router();
// Monterji ne vidijo cen ponudbe.
router.use(requireRoles([ROLE_ADMIN, ROLE_SALES, ROLE_FINANCE, ROLE_ORGANIZER]));

router.get('/:offerVersionId/pdf-preview', getOfferPdfPreviewController);
router.post('/import/parse', parseOfferImport);

export default router;
