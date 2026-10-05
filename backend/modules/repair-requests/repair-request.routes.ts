import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getCommunicationSenderSettings } from '../communication/services/communication.service';
import { sendEmail } from '../communication/services/email-transport.service';
import { RepairRequestValidationError, resolveRepairRequestAdmins, validateRepairRequest } from './repair-request.service';

const router = Router();

// Mounted behind requireAuth; available to every signed-in application user.
router.post('/', async (req, res) => {
  try {
    const request = await validateRepairRequest(req.body);
    const context = (req as any).context;
    const recipients = await resolveRepairRequestAdmins(context.tenantId);
    if (!recipients.length) return res.fail('Administrator nima nastavljenega e-poštnega naslova.', 503);
    const sender = await getCommunicationSenderSettings();
    if (!sender.enabled || !sender.senderEmail) return res.fail('Pošiljanje e-pošte v aplikaciji ni nastavljeno.', 503);
    const actor = (req as any).authUser;
    const id = randomUUID();
    const result = await sendEmail({
      from: { name: sender.senderName || 'AIntel', address: sender.senderEmail },
      to: recipients,
      replyTo: actor?.email || sender.replyToEmail || undefined,
      subject: `AIntel: Zahtevek za popravek [${id.slice(0, 8)}]`,
      text: [
        'Zahtevek za popravek / predlog izboljšave', '',
        `Uporabnik: ${actor?.name || ''} (${actor?.email || ''})`,
        `Modul: ${request.moduleName}`, `Stran: ${request.page}`,
        `Zajem: ${request.capturedAt}`, `Poslano: ${new Date().toISOString()}`, `ID: ${id}`, '',
        'Komentar:', request.comment, '', 'Označena slika zaslona je v prilogi.',
      ].join('\n'),
      attachments: [{ filename: `zahtevek-${id.slice(0, 8)}.jpg`, content: request.attachment, contentType: 'image/jpeg' }],
    });
    if (!result.accepted?.length) throw new Error('Email was not accepted by the mail server.');
    return res.success({ id });
  } catch (error) {
    if (error instanceof RepairRequestValidationError) return res.fail(error.message, 400);
    console.error('[repair-requests] Pošiljanje zahtevka ni uspelo.', error);
    return res.fail('Zahtevka ni bilo mogoče poslati. Komentar in slika sta ohranjena; poskusi znova.', 502);
  }
});

export default router;
