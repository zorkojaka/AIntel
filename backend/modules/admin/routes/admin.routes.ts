import { Router } from 'express';
import multer from 'multer';

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
import {
  analyzeCenikExcelImport,
  applyCenikExcelImport,
  exportCenikExcel,
} from '../../cenik/controllers/excel.controller';

const router = Router();
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/import/products/from-git', importProductsFromGit);
router.post('/import/products/resolve-conflict', resolveProductImportConflictController);
router.get('/import/products/runs', getProductImportRuns);
router.get('/import/products/runs/:id', getProductImportRunById);
router.get('/products/duplicate-candidates', getProductDuplicateCandidates);
router.post('/products/merge-duplicate', mergeDuplicateProduct);
router.get('/cenik/audit', auditCenik);
router.get('/cenik/export-excel', exportCenikExcel);
router.post('/cenik/import-excel/analyze', excelUpload.single('file'), analyzeCenikExcelImport);
router.post('/cenik/import-excel/apply', excelUpload.single('file'), applyCenikExcelImport);

export default router;
