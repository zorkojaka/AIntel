import { Router } from 'express';

import { importProductsFromGit } from '../controllers/import.controller';

const router = Router();

router.post('/import/products/from-git', importProductsFromGit);

export default router;
