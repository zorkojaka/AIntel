import { Request, Response } from 'express';
import {
  cloneInvoiceVersion,
  createInvoiceFromClosing,
  getInvoiceVersions,
  issueInvoiceVersion,
  updateInvoiceVersion,
} from '../services/invoice.service';
import { generateInvoicePdf } from '../services/invoice-pdf.service';

function getProjectId(req: Request) {
  return (req.params.projectId ?? req.params.id ?? '').trim();
}

function getVersionId(req: Request) {
  return (req.params.versionId ?? '').trim();
}

function handleError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'Neznana napaka pri delu z računi.';
  return res.fail(message, 400);
}

export async function listInvoices(req: Request, res: Response) {
  try {
    const payload = await getInvoiceVersions(getProjectId(req));
    return res.success(payload);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createInvoice(req: Request, res: Response) {
  try {
    const payload = await createInvoiceFromClosing(getProjectId(req));
    return res.success(payload, 201);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateInvoice(req: Request, res: Response) {
  try {
    const payload = await updateInvoiceVersion(getProjectId(req), getVersionId(req), {
      items: Array.isArray(req.body?.items) ? req.body.items : [],
    });
    return res.success(payload);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function issueInvoice(req: Request, res: Response) {
  try {
    const payload = await issueInvoiceVersion(getProjectId(req), getVersionId(req));
    return res.success(payload);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function cloneInvoiceForEdit(req: Request, res: Response) {
  try {
    const payload = await cloneInvoiceVersion(getProjectId(req), getVersionId(req));
    return res.success(payload, 201);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function exportInvoicePdf(req: Request, res: Response) {
  try {
    const requestedType = typeof req.query.docType === 'string' ? req.query.docType.toUpperCase() : 'INVOICE';
    const docType = requestedType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE';
    const buffer = await generateInvoicePdf(getProjectId(req), getVersionId(req), { docType });
    res.setHeader('Content-Type', 'application/pdf');
    const slug = docType === 'CREDIT_NOTE' ? 'credit-note' : 'invoice';
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-${getVersionId(req)}.pdf"`);
    return res.end(buffer);
  } catch (error) {
    return handleError(res, error);
  }
}
