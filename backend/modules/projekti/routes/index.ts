import { Router } from 'express';
import {
  createProject,
  deleteProject,
  getProjectById,
  getProjects,
  getProjectTimeline,
  updateProject,
  confirmProjectPhase
} from '../controllers/projectController';

const router = Router();

router.get('/', getProjects);
router.post('/', createProject);
router.get('/:id', getProjectById);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);
router.post('/:id/confirm-phase', confirmProjectPhase);
router.get('/:id/timeline', getProjectTimeline);

export default router;
