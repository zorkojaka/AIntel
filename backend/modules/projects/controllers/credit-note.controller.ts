import type { Request, Response } from 'express';
import { getCreditNoteOptions, issueCreditNote, previewCreditNote } from '../services/credit-note.service';
import { generateCreditNotePdf } from '../services/invoice-pdf.service';
import { buildActorDisplayName } from '../../communication/services/communication.service';

export async function listCreditNotes(req: Request, res: Response) {
  try { return res.success(await getCreditNoteOptions(req.params.projectId, req.params.versionId)); }
  catch (error) { return res.fail(error instanceof Error ? error.message : 'Dobropisov ni mogoče naložiti.', 400); }
}
export async function previewCredit(req: Request, res: Response) {
  try { return res.success(await previewCreditNote(req.params.projectId, req.params.versionId, req.body)); }
  catch (error) { return res.fail(error instanceof Error ? error.message : 'Predogled ni uspel.', 400); }
}
export async function issueCredit(req: Request, res: Response) {
  try {
    return res.success(await issueCreditNote(req.params.projectId, req.params.versionId, req.body, {
      name: buildActorDisplayName(req as any), userId: (req as any).context?.actorUserId ?? (req as any).user?.id ?? null,
    }), 201);
  } catch (error) { return res.fail(error instanceof Error ? error.message : 'Izdaja dobropisa ni uspela.', 400); }
}
export async function exportCreditPdf(req: Request, res: Response) {
  try {
    const buffer = await generateCreditNotePdf(req.params.projectId, req.params.versionId, req.params.noteId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.mode === 'inline' ? 'inline' : 'attachment'}; filename="dobropis.pdf"`);
    return res.end(buffer);
  } catch (error) { return res.fail(error instanceof Error ? error.message : 'PDF dobropisa ni na voljo.', 400); }
}
