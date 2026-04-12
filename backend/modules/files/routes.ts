import { Router } from 'express';
import { upload } from '../../utils/fileUpload';
import { uploadFile, deleteFileHandler } from './controller';

const router = Router();

/**
 * POST /api/files/upload
 * Upload a single file
 * 
 * Body (multipart/form-data):
 * - file: the file to upload
 * - entityType: type of entity (e.g., 'material-order', 'work-order', 'execution-unit')
 * - entityId: ID of the entity
 */
router.post('/upload', upload.single('file'), uploadFile);

/**
 * DELETE /api/files/:filename
 * Delete a file
 * 
 * Query params:
 * - entityType: type of entity
 * - entityId: ID of the entity
 */
router.delete('/:filename', deleteFileHandler);

export default router;
