import { Router, type Request, type Response } from 'express';
import { listSuppliers, upsertSupplierEmails } from './supplier.service';
import { sendSupplierOrderEmail } from './supplier-order-email.service';

const router = Router();

// Seznam dobaviteljev (cenik + naročila materiala) z nastavljenimi e-naslovi.
router.get('/', async (_req: Request, res: Response) => {
  try {
    const suppliers = await listSuppliers();
    return res.success({ suppliers });
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Dobaviteljev ni bilo mogoče naložiti.', 500);
  }
});

// Shrani e-naslove dobavitelja (natanko en privzeti).
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const supplier = await upsertSupplierEmails(req.params.key, String(req.body?.name ?? ''), req.body?.emails);
    return res.success({ supplier });
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Dobavitelja ni bilo mogoče shraniti.', 400);
  }
});

export default router;

// Projekt-vezan kontroler: pošlji naročilo dobavitelju po e-mailu in označi
// postavke kot naročene. Priklopljen v modules/projects/routes (priprava).
export async function supplierOrderEmailController(req: Request, res: Response) {
  try {
    const result = await sendSupplierOrderEmail({
      projectId: req.params.projectId,
      materialOrderId: req.params.materialOrderId,
      supplierName: String(req.body?.supplierName ?? ''),
      itemIds: req.body?.itemIds,
      to: req.body?.to,
      subject: req.body?.subject,
      body: req.body?.body,
    });
    return res.success(result);
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Naročila ni bilo mogoče poslati.', 400);
  }
}
