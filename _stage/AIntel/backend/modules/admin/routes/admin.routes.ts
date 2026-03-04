import { Router } from 'express';

import { importProductsFromGit } from '../controllers/import.controller';
import { auditCenik } from '../controllers/cenik-audit.controller';

const router = Router();

router.post('/import/products/from-git', importProductsFromGit);
router.get('/cenik/audit', auditCenik);

export default router;
