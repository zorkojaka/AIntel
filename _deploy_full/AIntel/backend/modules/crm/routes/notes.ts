import { Router } from 'express';
import { getNotesByEntity } from '../controllers/notesController';

const router = Router();

router.get('/:entityType/:entityId', getNotesByEntity);

export default router;
