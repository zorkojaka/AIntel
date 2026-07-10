import { Request, Response } from "express";
import {
  buildActorDisplayName,
  getCommunicationMessage,
  listOfferMessages,
  sendInvoiceCommunicationEmail,
  listProjectCommunicationFeed,
  normalizeWorkOrderObjectId,
  sendInstallerPreparationEmail,
  sendOfferCommunicationEmail,
  sendWorkOrderConfirmationCommunicationEmail,
} from "../services/communication.service";

function sanitizeAttachmentTypes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is "offer_pdf" | "project_pdf" | "work_order_pdf" | "work_order_confirmation_pdf" | "invoice_pdf" =>
      entry === "offer_pdf" ||
      entry === "project_pdf" ||
      entry === "work_order_pdf" ||
      entry === "work_order_confirmation_pdf" ||
      entry === "invoice_pdf"
  );
}

function sanitizeOfferIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    )
  );
}

function resolveActorProfile(req: Request) {
  const authEmployee = (req as any)?.authEmployee;
  const authUser = (req as any)?.authUser;
  const fallbackRoles = Array.isArray((req as any)?.user?.roles) ? (req as any).user.roles : [];
  const employeeRoles = Array.isArray(authEmployee?.roles) ? authEmployee.roles : [];
  const role = employeeRoles[0] ?? fallbackRoles[0] ?? null;

  return {
    name: authEmployee?.name ?? authUser?.name ?? null,
    email: authEmployee?.email ?? authUser?.email ?? null,
    phone: authEmployee?.phone ?? null,
    role,
  };
}

export async function sendOfferCommunicationController(req: Request, res: Response) {
  try {
    const input = {
      projectId: req.params.projectId,
      offerId: req.params.offerVersionId,
      to: req.body?.to,
      cc: req.body?.cc,
      bcc: req.body?.bcc,
      templateId: typeof req.body?.templateId === "string" ? req.body.templateId : null,
      templateKey: typeof req.body?.templateKey === "string" ? req.body.templateKey : null,
      subject: typeof req.body?.subject === "string" ? req.body.subject : null,
      body: typeof req.body?.body === "string" ? req.body.body : null,
      selectedAttachments: sanitizeAttachmentTypes(req.body?.selectedAttachments),
      selectedOfferIds: sanitizeOfferIds(req.body?.selectedOfferIds),
      actorUserId: (req as any)?.context?.actorUserId ?? null,
      actorDisplayName: buildActorDisplayName(req as any),
      actorProfile: resolveActorProfile(req),
    };

    void sendOfferCommunicationEmail(input).catch((error) => {
      (req as any).log?.error({ err: error }, "Offer communication background send failed");
    });

    // Follow-up dogovorjen ob pošiljanju (checkbox v dialogu): opravilo nastane
    // takoj, z rokom čez N dni. scheduleOfferFollowUpTask sam upošteva način
    // pravila (off → nič) in dedupeKey (ni podvajanja s scanom).
    const followUp = req.body?.followUp;
    if (followUp && followUp.enabled === true) {
      const days = Number(followUp.days);
      void import("../../scheduler/rules")
        .then(({ scheduleOfferFollowUpTask }) =>
          scheduleOfferFollowUpTask({
            offerId: String(req.params.offerVersionId),
            days,
            actorUserId: (req as any)?.context?.actorUserId ?? null,
          }),
        )
        .catch((error) => {
          (req as any).log?.error({ err: error }, "Offer follow-up scheduling failed");
        });
    }

    return res.status(202).json({
      success: true,
      data: { queued: true },
      error: null,
    });
  } catch (error) {
    (req as any).log?.error({ err: error }, "Offer communication send failed");
    return res.fail(error instanceof Error ? error.message : "Pošiljanje emaila ni uspelo.", 400);
  }
}

export async function sendInvoiceCommunicationController(req: Request, res: Response) {
  try {
    const payload = await sendInvoiceCommunicationEmail({
      projectId: req.params.projectId,
      invoiceVersionId: req.params.versionId,
      to: req.body?.to,
      cc: req.body?.cc,
      bcc: req.body?.bcc,
      templateId: typeof req.body?.templateId === "string" ? req.body.templateId : null,
      templateKey: typeof req.body?.templateKey === "string" ? req.body.templateKey : null,
      subject: typeof req.body?.subject === "string" ? req.body.subject : null,
      body: typeof req.body?.body === "string" ? req.body.body : null,
      selectedAttachments: sanitizeAttachmentTypes(req.body?.selectedAttachments),
      actorUserId: (req as any)?.context?.actorUserId ?? null,
      actorDisplayName: buildActorDisplayName(req as any),
      actorProfile: resolveActorProfile(req),
    });
    return res.success(payload);
  } catch (error) {
    (req as any).log?.error({ err: error }, "Invoice communication send failed");
    return res.fail(error instanceof Error ? error.message : "Pošiljanje emaila ni uspelo.", 400);
  }
}

export async function sendWorkOrderConfirmationCommunicationController(req: Request, res: Response) {
  try {
    const payload = await sendWorkOrderConfirmationCommunicationEmail({
      projectId: req.params.projectId,
      workOrderId: req.params.workOrderId,
      to: req.body?.to,
      cc: req.body?.cc,
      bcc: req.body?.bcc,
      templateId: typeof req.body?.templateId === "string" ? req.body.templateId : null,
      templateKey: typeof req.body?.templateKey === "string" ? req.body.templateKey : null,
      subject: typeof req.body?.subject === "string" ? req.body.subject : null,
      body: typeof req.body?.body === "string" ? req.body.body : null,
      selectedAttachments: sanitizeAttachmentTypes(req.body?.selectedAttachments),
      actorUserId: (req as any)?.context?.actorUserId ?? null,
      actorDisplayName: buildActorDisplayName(req as any),
      actorProfile: resolveActorProfile(req),
      allowSendWithoutSignature: Boolean(req.body?.allowSendWithoutSignature),
    });
    return res.success(payload);
  } catch (error) {
    (req as any).log?.error({ err: error }, "Work order confirmation communication send failed");
    const errorCode = typeof error === "object" && error !== null && "code" in error ? (error as any).code : null;
    if (typeof errorCode === "string") {
      const message =
        error instanceof Error
          ? error.message
          : typeof (error as any)?.message === "string"
            ? (error as any).message
            : "Pošiljanje emaila ni uspelo.";
      const statusCode =
        typeof (error as any)?.statusCode === "number" ? Number((error as any).statusCode) : 400;
      return res.status(statusCode).json({
        success: false,
        data: null,
        error: message,
        code: errorCode,
        message,
      });
    }
    return res.fail(error instanceof Error ? error.message : "Pošiljanje emaila ni uspelo.", 400);
  }
}

export async function sendInstallerPreparationCommunicationController(req: Request, res: Response) {
  try {
    const workOrderId = normalizeWorkOrderObjectId(req.params.workOrderId);
    if (!workOrderId) {
      return res.fail("Delovni nalog ni pravilno določen.", 400);
    }

    const payload = await sendInstallerPreparationEmail({
      projectId: req.params.projectId,
      workOrderId,
      to: req.body?.to,
      cc: req.body?.cc,
      bcc: req.body?.bcc,
      subject: typeof req.body?.subject === "string" ? req.body.subject : null,
      body: typeof req.body?.body === "string" ? req.body.body : null,
      projectLink:
        typeof req.body?.projectLink === "string" && req.body.projectLink.trim()
          ? req.body.projectLink.trim()
          : `${req.protocol}://${req.get("host")}/projects/${encodeURIComponent(req.params.projectId)}`,
      previewOnly: req.body?.previewOnly === true,
      actorUserId: (req as any)?.context?.actorUserId ?? null,
      actorDisplayName: buildActorDisplayName(req as any),
      actorProfile: resolveActorProfile(req),
    });
    return res.success(payload);
  } catch (error) {
    (req as any).log?.error({ err: error }, "Installer preparation communication send failed");
    return res.fail(error instanceof Error ? error.message : "Pošiljanje emaila ni uspelo.", 400);
  }
}

export async function getProjectCommunicationFeedController(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit ?? 20);
    const feed = await listProjectCommunicationFeed(req.params.projectId, Number.isFinite(limit) ? limit : 20);
    return res.success(feed);
  } catch (error) {
    (req as any).log?.error({ err: error }, "Project communication feed load failed");
    return res.fail("Komunikacijskega feeda ni mogoče naložiti.", 500);
  }
}

export async function getOfferMessagesController(req: Request, res: Response) {
  try {
    const messages = await listOfferMessages(req.params.projectId, req.params.offerVersionId);
    return res.success(messages);
  } catch (error) {
    (req as any).log?.error({ err: error }, "Offer messages load failed");
    return res.fail("Sporočil ni mogoče naložiti.", 500);
  }
}

export async function getCommunicationMessageController(req: Request, res: Response) {
  try {
    const message = await getCommunicationMessage(req.params.projectId, req.params.messageId);
    if (!message) {
      return res.fail("Sporočilo ni najdeno.", 404);
    }
    return res.success(message);
  } catch (error) {
    (req as any).log?.error({ err: error }, "Communication message load failed");
    return res.fail("Sporočila ni mogoče naložiti.", 500);
  }
}
