import { Router } from 'express';
import { confirmPhase, createProject, getProject, getTimeline, listProjects } from '../controllers/projectController';

const router = Router();

router.get('/', listProjects);
router.post('/', createProject);
router.get('/:id', getProject);
router.get('/:id/timeline', getTimeline);
router.post('/:id/confirm-phase', confirmPhase);

export default router;
