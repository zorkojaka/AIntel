import { Router } from 'express';

import {
  getProductImportRunById,
  getProductImportRuns,
  importProductsFromGit,
  resolveProductImportConflictController,
} from '../controllers/import.controller';
import { auditCenik } from '../controllers/cenik-audit.controller';
import {
  getProductDuplicateCandidates,
  mergeDuplicateProduct,
} from '../controllers/product-duplicate.controller';

const router = Router();

router.post('/import/products/from-git', importProductsFromGit);
router.post('/import/products/resolve-conflict', resolveProductImportConflictController);
router.get('/import/products/runs', getProductImportRuns);
router.get('/import/products/runs/:id', getProductImportRunById);
router.get('/products/duplicate-candidates', getProductDuplicateCandidates);
router.post('/products/merge-duplicate', mergeDuplicateProduct);
router.get('/cenik/audit', auditCenik);

export default router;
