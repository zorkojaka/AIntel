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

function blockNonPost(req: Request, res: Response, next: () => void) {
  if (req.method === 'POST') {
    return next();
  }
  return (res as any).fail('Metoda ni dovoljena.', 405);
}

router.use('/login', blockNonPost);
router.post('/login', login);
router.use('/logout', blockNonPost);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.post('/invite', requireAuth, requireRoles([ROLE_ADMIN]), invite);
router.use('/accept-invite', blockNonPost);
router.post('/accept-invite', acceptInvite);
router.use('/request-password-reset', blockNonPost);
router.post('/request-password-reset', requestPasswordReset);
router.use('/reset-password', blockNonPost);
router.post('/reset-password', resetPassword);

export default router;
