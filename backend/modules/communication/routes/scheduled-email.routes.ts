import { Router, type Request } from 'express';
import { ROLE_ADMIN } from '../../../utils/roles';
import { cancelScheduledEmail, listScheduledEmails } from '../services/scheduled-email.service';

const router = Router();

function viewer(req: Request) {
  const context = (req as any).context ?? {};
  const roles: string[] = Array.isArray(context.roles) ? context.roles : [];
  return { tenantId: String(context.tenantId), actorUserId: String(context.actorUserId), isAdmin: roles.includes(ROLE_ADMIN) };
}

router.get('/', async (req, res) => {
  try {
    return res.success(await listScheduledEmails(viewer(req)));
  } catch (error) {
    return res.fail('Odloženih sporočil ni mogoče naložiti.', 500);
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    return res.success(await cancelScheduledEmail(String(req.params.id), viewer(req)));
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Preklic ni uspel.', 400);
  }
});

export default router;
