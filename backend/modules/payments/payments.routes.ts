import { Router, type Request, type Response } from 'express';
import {
  confirmPayment,
  deletePayment,
  listPayments,
  PaymentError,
  recordManualPayment,
} from './payments.service';

// Plačila računov: ročni vnosi + potrjevanje plačil iz bančnih mailov.
// Vloge omeji priklop v routes.ts (ADMIN, FINANCE).

const router = Router();

function actorUserId(req: Request): string | null {
  const context = (req as unknown as { context?: { actorUserId?: string } }).context;
  return context?.actorUserId ? String(context.actorUserId) : null;
}

function fail(res: Response, error: unknown, fallback: string) {
  if (error instanceof PaymentError) {
    return res.fail(error.message, error.statusCode);
  }
  console.error(fallback, error);
  return res.fail(fallback, 500);
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const payments = await listPayments({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      invoiceNumber: typeof req.query.invoiceNumber === 'string' ? req.query.invoiceNumber : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return res.success({ payments });
  } catch (error) {
    return fail(res, error, 'Plačil ni bilo mogoče naložiti.');
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const payment = await recordManualPayment({
      invoiceNumber: String(req.body?.invoiceNumber ?? ''),
      amount: req.body?.amount,
      receivedAt: req.body?.receivedAt,
      note: req.body?.note,
      actorUserId: actorUserId(req),
    });
    return res.success({ payment });
  } catch (error) {
    return fail(res, error, 'Plačila ni bilo mogoče zabeležiti.');
  }
});

router.post('/:paymentId/confirm', async (req: Request, res: Response) => {
  try {
    const payment = await confirmPayment(req.params.paymentId, {
      invoiceNumber: req.body?.invoiceNumber,
      actorUserId: actorUserId(req),
    });
    return res.success({ payment });
  } catch (error) {
    return fail(res, error, 'Plačila ni bilo mogoče potrditi.');
  }
});

router.delete('/:paymentId', async (req: Request, res: Response) => {
  try {
    const deleted = await deletePayment(req.params.paymentId);
    if (!deleted) {
      return res.fail('Plačilo ne obstaja.', 404);
    }
    return res.success({ deleted: true });
  } catch (error) {
    return fail(res, error, 'Plačila ni bilo mogoče izbrisati.');
  }
});

export default router;
