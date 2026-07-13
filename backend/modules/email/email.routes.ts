import { Router, type Request, type Response } from 'express';

import { EmailMessageModel, EMAIL_MESSAGE_STATUSES, type EmailMessageStatus } from './email-message.model';
import { getEmailIngestDiagnostics, ingestInboundEmail, linkEmailToProject } from './email-ingest.service';
import { EmailIngestStateModel } from './email-message.model';

// AIN-P1-14: resolve center — pregled dohodne pošte znotraj AIntela
// (poslano/prejeto/odprto, po strankah), brez odpiranja e-poštnega odjemalca.
// Globalni requireAuth je na /api (core/app.ts).
const router = Router();

router.get('/messages', async (req: Request, res: Response) => {
  try {
    const query: Record<string, unknown> = { tenantId: 'inteligent' };
    const status = String(req.query.status ?? '').trim() as EmailMessageStatus;
    if (status && EMAIL_MESSAGE_STATUSES.includes(status)) query.status = status;
    const projectId = String(req.query.projectId ?? '').trim();
    if (projectId) query['match.projectId'] = projectId;
    const from = String(req.query.from ?? '').trim().toLowerCase();
    if (from) query.fromAddress = from;
    const q = String(req.query.q ?? '').trim();
    if (q) {
      const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ subject: pattern }, { fromAddress: pattern }, { fromName: pattern }];
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const messages = await EmailMessageModel.find(query).sort({ date: -1 }).limit(limit).lean();
    const state = await EmailIngestStateModel.findById('INBOX').lean();
    return res.success({
      messages,
      ingest: {
        ...getEmailIngestDiagnostics(),
        lastRunAt: state?.lastRunAt ?? null,
        lastError: state?.lastError ?? null,
      },
    });
  } catch (error) {
    (req as any).log?.error({ err: error }, '[email] list failed');
    return res.fail('Pošte ni mogoče prebrati.', 500);
  }
});

router.get('/messages/:id', async (req: Request, res: Response) => {
  try {
    const message = await EmailMessageModel.findById(String(req.params.id)).lean();
    if (!message) return res.fail('Sporočilo ni najdeno.', 404);
    return res.success(message);
  } catch (error) {
    return res.fail('Sporočila ni mogoče prebrati.', 500);
  }
});

router.post('/messages/:id/link', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.body?.projectId ?? '').trim();
    if (!projectId) return res.fail('projectId je obvezen.', 400);
    return res.success(await linkEmailToProject(String(req.params.id), projectId));
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Povezava ni uspela.', 400);
  }
});

router.post('/messages/:id/ignore', async (req: Request, res: Response) => {
  try {
    const message = await EmailMessageModel.findByIdAndUpdate(
      String(req.params.id),
      { $set: { status: 'ignored' } },
      { new: true },
    ).lean();
    if (!message) return res.fail('Sporočilo ni najdeno.', 404);
    return res.success(message);
  } catch (error) {
    return res.fail('Sporočila ni mogoče označiti.', 500);
  }
});

// Ročni zagon branja (za test brez čakanja na cron).
router.post('/ingest/run', async (req: Request, res: Response) => {
  try {
    return res.success(await ingestInboundEmail());
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Branje nabiralnika ni uspelo.', 500);
  }
});

export default router;
