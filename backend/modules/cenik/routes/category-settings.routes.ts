import { Router } from 'express';

import {
  bulkUpdateCategorySettingsController,
  getCategorySettings,
  refreshCategoryStats,
  updateCategorySetting,
} from '../controllers/category-settings.controller';

const router = Router();

router.get('/', getCategorySettings);
router.put('/bulk', bulkUpdateCategorySettingsController);
router.post('/refresh-stats', refreshCategoryStats);
router.put('/:id', updateCategorySetting);

export default router;
