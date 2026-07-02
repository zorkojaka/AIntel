import type { CommunicationAttachmentType } from "../../../../shared/types/communication";
import { OfferVersionModel } from "../../projects/schemas/offer-version";
import { ProjectModel } from "../../projects/schemas/project";
import { WorkOrderModel } from "../../projects/schemas/work-order";
import { generateOfferDocumentPdf } from "../../projects/services/offer-pdf-preview.service";
import { generateOfferDescriptionsPdf } from "../../projects/services/offer-description-pdf.service";
import { generateWorkOrderDocumentPdf } from "../../projects/services/project-document-pdf.service";
import { getActiveSignedConfirmationVersion } from "../../projects/services/work-order-confirmation.service";
import { generateInvoicePdf } from "../../projects/services/invoice-pdf.service";

export interface ResolvedAttachment {
  type: CommunicationAttachmentType;
  refId: string;
  filename: string;
  content: Buffer;
  contentType: string;
}

function sanitizeFilePart(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, 120);
}

function buildOfferFileCore(offer: any, project: any, offerId: string) {
  const projectIdentifier = String(project.projectNumber ?? project.code ?? project.id ?? offer.projectId ?? "")
    .trim()
    .replace(/^PRJ-/i, "");
  const offerTitle = offer.baseTitle?.trim() || offer.title?.trim() || "Ponudba";
  const customerName = project.customerName?.trim() || project.customer?.name?.trim() || "";
  const parts = [offerTitle, customerName || offerId].filter(Boolean);
  return {
    projectIdentifier: sanitizeFilePart(projectIdentifier || offerId) || "projekt",
    suffix: sanitizeFilePart(parts.join(" - ")) || sanitizeFilePart(offerId) || "Ponudba",
  };
}

export async function resolveCommunicationAttachment(params: {
  type: CommunicationAttachmentType;
  projectId: string;
  offerId?: string | null;
  workOrderId?: string | null;
  invoiceVersionId?: string | null;
}): Promise<ResolvedAttachment> {
  const { type, projectId, offerId, workOrderId, invoiceVersionId } = params;

  if (type === "invoice_pdf") {
    if (!invoiceVersionId) {
      throw new Error("Račun za priponko ni podan.");
    }

    const project = await ProjectModel.findOne({ id: projectId }).lean();
    const invoice = (project?.invoiceVersions ?? []).find((entry: any) => String(entry?._id) === invoiceVersionId);
    if (!project || !invoice) {
      throw new Error("Račun za priponko ni najden.");
    }

    const invoiceIdentifier = invoice.invoiceNumber || `verzija ${invoice.versionNumber ?? invoiceVersionId}`;
    const customerName = project.customerName?.trim() || project.customer?.name?.trim() || "";
    const label = sanitizeFilePart(`Račun ${invoiceIdentifier}${customerName ? ` - ${customerName}` : ""}`) || "Racun";
    const buffer = await generateInvoicePdf(projectId, invoiceVersionId, { docType: "INVOICE" });

    return {
      type,
      refId: invoiceVersionId,
      filename: `${label}.pdf`,
      content: buffer,
      contentType: "application/pdf",
    };
  }

  if (type === "work_order_pdf") {
    if (!workOrderId) {
      throw new Error("Delovni nalog za priponko ni podan.");
    }

    const [project, workOrder] = await Promise.all([
      ProjectModel.findOne({ id: projectId }).lean(),
      WorkOrderModel.findOne({ _id: workOrderId, projectId }).lean(),
    ]);
    if (!project || !workOrder) {
      throw new Error("Delovni nalog za priponko ni najden.");
    }

    const projectIdentifier =
      project.code?.trim() || workOrder.code?.trim() || workOrder.title?.trim() || project.title?.trim() || project.id || workOrderId;
    const buffer = await generateWorkOrderDocumentPdf(projectId, workOrderId, "WORK_ORDER");
    const workOrderLabel = sanitizeFilePart(`Delovni nalog ${projectIdentifier}`) || "Delovni-nalog";

    return {
      type,
      refId: workOrderId,
      filename: `${workOrderLabel}.pdf`,
      content: buffer,
      contentType: "application/pdf",
    };
  }

  if (type === "work_order_confirmation_pdf") {
    if (!workOrderId) {
      throw new Error("Delovni nalog za priponko ni podan.");
    }

    const [project, workOrder] = await Promise.all([
      ProjectModel.findOne({ id: projectId }).lean(),
      WorkOrderModel.findOne({ _id: workOrderId, projectId }).lean(),
    ]);
    if (!project || !workOrder) {
      throw new Error("Potrjeno potrdilo delovnega naloga ni najdeno.");
    }
    const activeConfirmationVersion = getActiveSignedConfirmationVersion(workOrder);
    const hasActiveSignedConfirmation =
      workOrder.confirmationState === "signed_active" &&
      Boolean(workOrder.confirmationActiveVersionId) &&
      Boolean(activeConfirmationVersion?.signedAt);
    if (!hasActiveSignedConfirmation || !activeConfirmationVersion) {
      throw new Error("Potrdilo delovnega naloga še ni podpisano.");
    }

    const projectIdentifier =
      project.code?.trim() || workOrder.code?.trim() || workOrder.title?.trim() || project.title?.trim() || project.id || workOrderId;
    const buffer = await generateWorkOrderDocumentPdf(
      projectId,
      workOrderId,
      "WORK_ORDER_CONFIRMATION",
      activeConfirmationVersion.id,
    );
    const confirmationLabel = sanitizeFilePart(`Potrdilo delovnega naloga ${projectIdentifier}`) || "Potrdilo-delovnega-naloga";

    return {
      type,
      refId: workOrderId,
      filename: `${confirmationLabel}.pdf`,
      content: buffer,
      contentType: "application/pdf",
    };
  }

  if (!offerId) {
    throw new Error("Ponudba za priponko ni podana.");
  }

  const [offer, project] = await Promise.all([
    OfferVersionModel.findOne({ _id: offerId, projectId }).lean(),
    ProjectModel.findOne({ id: projectId }).lean(),
  ]);
  if (!offer || !project) {
    throw new Error("Ponudba za priponko ni najdena.");
  }

  const offerFileCore = buildOfferFileCore(offer, project, offerId);

  if (type === "offer_pdf") {
    const buffer = await generateOfferDocumentPdf(offerId, "OFFER");
    const offerLabel = sanitizeFilePart(`Ponudba-${offerFileCore.projectIdentifier} - ${offerFileCore.suffix}`) || "Ponudba";
    return {
      type,
      refId: offerId,
      filename: `${offerLabel}.pdf`,
      content: buffer,
      contentType: "application/pdf",
    };
  }

  const buffer = await generateOfferDescriptionsPdf(offer as any);
  const descriptionLabel = sanitizeFilePart(`Opis-${offerFileCore.projectIdentifier} - ${offerFileCore.suffix}`) || "Opis";
  return {
    type,
    refId: offerId,
    filename: `${descriptionLabel}.pdf`,
    content: buffer,
    contentType: "application/pdf",
  };
}
