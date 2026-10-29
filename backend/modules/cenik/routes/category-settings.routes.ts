import { Router } from 'express';

import {
  bulkUpdateCategorySettingsController,
  getCategorySettings,
  refreshCategoryStats,
  updateCategorySetting,
} from '../controllers/category-settings.controller';
import { requireRoles } from '../../../middlewares/auth';
import { ROLE_ADMIN } from '../../../utils/roles';

const router = Router();
// Marže kategorij preračunajo prodajne cene vseh produktov; organizator naših cen ne sme videti.
router.use(requireRoles([ROLE_ADMIN]));

router.get('/', getCategorySettings);
router.put('/bulk', bulkUpdateCategorySettingsController);
router.post('/refresh-stats', refreshCategoryStats);
router.put('/:id', updateCategorySetting);

export default router;
