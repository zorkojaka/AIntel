import { withScheduledEmail } from '../communication/services/scheduled-email.service';
import { Router } from 'express';

import { requireRoles } from '../../middlewares/auth';
import { PRICE_ROLES, ROLE_ADMIN } from '../../utils/roles';
import {
  getFollowUpDefaults,
  getMyTasks,
  getTasks,
  getTasksBySubject,
  getTaskTemplates,
  getWheelConfig,
  patchTask,
  patchTaskTemplate,
  postTask,
  postTaskTemplate,
  previewTaskFollowUpEmail,
  putWheelConfig,
  removeTaskTemplate,
  sendTaskFollowUpEmail,
} from './task.controller';

// AIN-P1-09 (AINTEL_WHEEL_SPEC.md §2): /api/tasks — global requireAuth is
// applied on /api in core/app.ts; the management list is ADMIN-gated.
const router = Router();

router.get('/my', getMyTasks);
router.get('/by-subject/:kind/:id', getTasksBySubject);
router.get('/', requireRoles([ROLE_ADMIN]), getTasks);
router.get('/wheel-config', requireRoles([ROLE_ADMIN]), getWheelConfig);
router.put('/wheel-config', requireRoles([ROLE_ADMIN]), putWheelConfig);
router.get('/follow-up-defaults', getFollowUpDefaults);
router.get('/templates', getTaskTemplates);
router.post('/templates', requireRoles([ROLE_ADMIN]), postTaskTemplate);
router.patch('/templates/:id', requireRoles([ROLE_ADMIN]), patchTaskTemplate);
router.delete('/templates/:id', requireRoles([ROLE_ADMIN]), removeTaskTemplate);
router.post('/', postTask);
// The follow-up shows the offer total and attaches the offer PDF (our prices).
const requirePriceAccess = requireRoles(PRICE_ROLES);
router.post('/:id/follow-up-email/preview', requirePriceAccess, previewTaskFollowUpEmail);
router.post('/:id/follow-up-email/send', requirePriceAccess, withScheduledEmail('task-follow-up', sendTaskFollowUpEmail, requirePriceAccess));
router.patch('/:id', patchTask);

export default router;
