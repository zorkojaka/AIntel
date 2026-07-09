import { Router } from 'express';

import { requireRoles } from '../../middlewares/auth';
import { ROLE_ADMIN } from '../../utils/roles';
import { getMyTasks, getTasks, getTasksBySubject, getWheelConfig, patchTask, postTask, putWheelConfig } from './task.controller';

// AIN-P1-09 (AINTEL_WHEEL_SPEC.md §2): /api/tasks — global requireAuth is
// applied on /api in core/app.ts; the management list is ADMIN-gated.
const router = Router();

router.get('/my', getMyTasks);
router.get('/by-subject/:kind/:id', getTasksBySubject);
router.get('/', requireRoles([ROLE_ADMIN]), getTasks);
router.get('/wheel-config', requireRoles([ROLE_ADMIN]), getWheelConfig);
router.put('/wheel-config', requireRoles([ROLE_ADMIN]), putWheelConfig);
router.post('/', postTask);
router.patch('/:id', patchTask);

export default router;
