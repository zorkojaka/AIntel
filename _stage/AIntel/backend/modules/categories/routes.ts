import { Router } from 'express';
import { createCategory, listCategories, listProjectCategoryOptions } from './controller';

const router = Router();

router.get('/', listCategories);
router.get('/project-options', listProjectCategoryOptions);
router.post('/', createCategory);

export default router;
