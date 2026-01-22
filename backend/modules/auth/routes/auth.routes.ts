import { Router } from 'express';
import {
  acceptInvite,
  invite,
  login,
  logout,
  me,
  requestPasswordReset,
  resetPassword,
} from '../controllers/auth.controller';
import { requireAuth, requireRoles } from '../../../middlewares/auth';
import { ROLE_ADMIN } from '../../../utils/roles';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.post('/invite', requireAuth, requireRoles([ROLE_ADMIN]), invite);
router.post('/accept-invite', acceptInvite);
router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);

export default router;
