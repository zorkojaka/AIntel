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
router.all('/login', (_req, res) => res.fail('Metoda ni dovoljena.', 405));
router.post('/logout', logout);
router.all('/logout', (_req, res) => res.fail('Metoda ni dovoljena.', 405));
router.get('/me', requireAuth, me);
router.post('/invite', requireAuth, requireRoles([ROLE_ADMIN]), invite);
router.post('/accept-invite', acceptInvite);
router.all('/accept-invite', (_req, res) => res.fail('Metoda ni dovoljena.', 405));
router.post('/request-password-reset', requestPasswordReset);
router.all('/request-password-reset', (_req, res) => res.fail('Metoda ni dovoljena.', 405));
router.post('/reset-password', resetPassword);
router.all('/reset-password', (_req, res) => res.fail('Metoda ni dovoljena.', 405));

export default router;
