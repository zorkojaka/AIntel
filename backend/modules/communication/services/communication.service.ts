import type {
  CommunicationAttachmentRecord,
  CommunicationAttachmentType,
  CommunicationCategory,
  CommunicationEvent,
  CommunicationMessage,
  CommunicationSenderSettings,
  CommunicationTemplate,
} from "../../../../shared/types/communication";
import { stripAppendedFooter } from "../../../../shared/utils/communication-footer";
import { CommunicationSenderSettingsModel } from "../schemas/sender-settings";
import { CommunicationTemplateModel } from "../schemas/template";
import { CommunicationMessageModel } from "../schemas/message";
import { CommunicationEventModel } from "../schemas/event";
import {
  appendCommunicationFooter,
  renderCommunicationFooterHtmlForEmail,
  buildTemplateContext,
  renderCommunicationTemplate,
  renderCommunicationText,
} from "./template-render.service";
import { resolveCommunicationAttachment } from "./attachment-resolver.service";
import { sendEmail } from "./email-transport.service";
import { ProjectModel } from "../../projects/schemas/project";
import { OfferVersionModel } from "../../projects/schemas/offer-version";
import { WorkOrderModel } from "../../projects/schemas/work-order";
import { resolveProjectClient } from "../../projects/services/project.service";
import { getActiveSignedConfirmationVersion } from "../../projects/services/work-order-confirmation.service";
import { getSettings } from "../../settings/settings.service";

const DEFAULT_SENDER_SETTINGS: CommunicationSenderSettings = {
  senderName: "",
  senderEmail: "",
  senderPhone: null,
  senderRole: null,
  defaultCc: null,
  defaultBcc: null,
  replyToEmail: null,
  emailFooterTemplate: "",
  enabled: false,
};

function serializeSenderSettings(doc: any): CommunicationSenderSettings {
  return {
    senderName: doc?.senderName ?? "",
    senderEmail: doc?.senderEmail ?? "",
    senderPhone: doc?.senderPhone ?? null,
    senderRole: doc?.senderRole ?? null,
    defaultCc: doc?.defaultCc ?? null,
    defaultBcc: doc?.defaultBcc ?? null,
    replyToEmail: doc?.replyToEmail ?? null,
    emailFooterTemplate: doc?.emailFooterTemplate ?? "",
    enabled: Boolean(doc?.enabled),
  };
}

function serializeTemplate(doc: any): CommunicationTemplate {
  return {
    id: String(doc?._id ?? doc?.id),
    key: doc?.key ?? "",
    name: doc?.name ?? "",
    category: doc?.category ?? "offer_send",
    subjectTemplate: doc?.subjectTemplate ?? "",
    bodyTemplate: doc?.bodyTemplate ?? "",
    defaultAttachments: Array.isArray(doc?.defaultAttachments) ? doc.defaultAttachments : [],
    isActive: Boolean(doc?.isActive),
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : "",
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : "",
  };
}

function serializeMessage(doc: any): CommunicationMessage {
  return {
    id: String(doc?._id ?? doc?.id),
    projectId: doc?.projectId ?? "",
    offerId: doc?.offerId ?? null,
    customerId: doc?.customerId ?? null,
    direction: doc?.direction ?? "outbound",
    channel: doc?.channel ?? "email",
    to: Array.isArray(doc?.to) ? doc.to : [],
    cc: Array.isArray(doc?.cc) ? doc.cc : [],
    bcc: Array.isArray(doc?.bcc) ? doc.bcc : [],
    subjectFinal: doc?.subjectFinal ?? "",
    bodyFinal: doc?.bodyFinal ?? "",
    templateId: doc?.templateId ?? null,
    templateKey: doc?.templateKey ?? null,
    selectedAttachments: Array.isArray(doc?.selectedAttachments) ? doc.selectedAttachments : [],
    status: doc?.status ?? "sent",
    sentAt: doc?.sentAt ? new Date(doc.sentAt).toISOString() : null,
    sentByUserId: doc?.sentByUserId ?? null,
    providerMessageId: doc?.providerMessageId ?? null,
    errorMessage: doc?.errorMessage ?? null,
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : "",
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : "",
  };
}

function serializeEvent(doc: any): CommunicationEvent {
  return {
    id: String(doc?._id ?? doc?.id),
    projectId: doc?.projectId ?? "",
    offerId: doc?.offerId ?? null,
    messageId: doc?.messageId ?? null,
    type: doc?.type ?? "system_note",
    title: doc?.title ?? "",
    description: doc?.description ?? "",
    timestamp: doc?.timestamp ? new Date(doc.timestamp).toISOString() : "",
    user: doc?.user ?? null,
    metadata: doc?.metadata ?? undefined,
  };
}

function sanitizeString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function sanitizeEmailList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeString(entry).toLowerCase())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[;,]/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

class CommunicationValidationError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "CommunicationValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("sl-SI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("sl-SI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toPublicLogoUrl(value: unknown) {
  const normalized = sanitizeString(value);
  if (!normalized) return "";
  return /^https?:\/\//i.test(normalized) ? normalized : "";
}

function toPublicEmailLogoUrl(value: unknown) {
  const normalized = sanitizeString(value);
  return isPublicHttpsUrl(normalized) ? normalized : "";
}

function isDataUrl(value: string) {
  return /^data:/i.test(value);
}

function isPublicHttpsUrl(value: string) {
  if (!/^https:\/\//i.test(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.trim().toLowerCase();
    if (!host || host === "localhost" || host === "0.0.0.0" || host === "::1") {
      return false;
    }
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
      return false;
    }
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return false;
    }
    if (host.endsWith(".local") || !host.includes(".")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function extensionFromContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("svg")) return "svg";
  return "img";
}

function parseDataUrlImage(value: string) {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!match) {
    return null;
  }

  try {
    return {
      contentType: match[1].toLowerCase(),
      content: Buffer.from(match[2], "base64"),
    };
  } catch {
    return null;
  }
}

async function resolveInlineCompanyLogo(logoSource: string | null | undefined) {
  const normalized = sanitizeString(logoSource);
  if (!normalized) {
    return null;
  }

  if (isDataUrl(normalized)) {
    const parsed = parseDataUrlImage(normalized);
    if (!parsed || parsed.content.length === 0) {
      return null;
    }
    return {
      cid: "company-logo",
      filename: `company-logo.${extensionFromContentType(parsed.contentType)}`,
      content: parsed.content,
      contentType: parsed.contentType,
    };
  }

  if (!isPublicHttpsUrl(normalized)) {
    return null;
  }

  try {
    const response = await fetch(normalized);
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) {
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const content = Buffer.from(arrayBuffer);
    if (content.length === 0) {
      return null;
    }
    return {
      cid: "company-logo",
      filename: `company-logo.${extensionFromContentType(contentType)}`,
      content,
      contentType,
    };
  } catch {
    return null;
  }
}

export async function getCommunicationSenderSettings() {
  const existing =
    (await CommunicationSenderSettingsModel.findById("singleton").lean()) ??
    (await CommunicationSenderSettingsModel.create({ _id: "singleton", ...DEFAULT_SENDER_SETTINGS }).then((doc) =>
      doc.toObject()
    ));
  return serializeSenderSettings({ ...DEFAULT_SENDER_SETTINGS, ...existing });
}

export async function updateCommunicationSenderSettings(payload: Partial<CommunicationSenderSettings>) {
  const doc =
    (await CommunicationSenderSettingsModel.findById("singleton")) ??
    new CommunicationSenderSettingsModel({ _id: "singleton", ...DEFAULT_SENDER_SETTINGS });

  doc.senderName = sanitizeString(payload.senderName) || "";
  doc.senderEmail = sanitizeString(payload.senderEmail).toLowerCase();
  doc.senderPhone = sanitizeString(payload.senderPhone) || null;
  doc.senderRole = sanitizeString(payload.senderRole) || null;
  doc.defaultCc = sanitizeString(payload.defaultCc) || null;
  doc.defaultBcc = sanitizeString(payload.defaultBcc) || null;
  doc.replyToEmail = sanitizeString(payload.replyToEmail).toLowerCase() || null;
  doc.emailFooterTemplate = typeof payload.emailFooterTemplate === "string" ? payload.emailFooterTemplate : "";
  doc.enabled = Boolean(payload.enabled);
  await doc.save();
  return serializeSenderSettings(doc.toObject());
}

export async function listCommunicationTemplates(category?: CommunicationCategory) {
  const filter = category ? { category } : {};
  const templates = await CommunicationTemplateModel.find(filter).sort({ name: 1, updatedAt: -1 }).lean();
  return templates.map(serializeTemplate);
}

export async function createCommunicationTemplate(payload: Partial<CommunicationTemplate>) {
  const created = await CommunicationTemplateModel.create({
    key: sanitizeString(payload.key).toLowerCase(),
    name: sanitizeString(payload.name),
    category: sanitizeString(payload.category) || "offer_send",
    subjectTemplate: payload.subjectTemplate ?? "",
    bodyTemplate: payload.bodyTemplate ?? "",
    defaultAttachments: Array.isArray(payload.defaultAttachments) ? payload.defaultAttachments : [],
    isActive: payload.isActive !== false,
  });
  return serializeTemplate(created.toObject());
}

export async function updateCommunicationTemplate(templateId: string, payload: Partial<CommunicationTemplate>) {
  const template = await CommunicationTemplateModel.findById(templateId);
  if (!template) {
    throw new Error("Predloga ni najdena.");
  }
  template.key = sanitizeString(payload.key || template.key).toLowerCase();
  template.name = sanitizeString(payload.name || template.name);
  template.category = (sanitizeString(payload.category || template.category) || "offer_send") as CommunicationCategory;
  template.subjectTemplate = payload.subjectTemplate ?? template.subjectTemplate;
  template.bodyTemplate = payload.bodyTemplate ?? template.bodyTemplate;
  template.defaultAttachments = Array.isArray(payload.defaultAttachments)
    ? payload.defaultAttachments
    : template.defaultAttachments;
  if (payload.isActive !== undefined) {
    template.isActive = Boolean(payload.isActive);
  }
  await template.save();
  return serializeTemplate(template.toObject());
}

export async function deleteCommunicationTemplate(templateId: string) {
  const deleted = await CommunicationTemplateModel.findByIdAndDelete(templateId);
  return Boolean(deleted);
}

export async function createCommunicationEvent(input: {
  projectId: string;
  offerId?: string | null;
  messageId?: string | null;
  type: CommunicationEvent["type"];
  title: string;
  description: string;
  user?: string | null;
  metadata?: Record<string, string>;
}) {
  const created = await CommunicationEventModel.create({
    projectId: input.projectId,
    offerId: input.offerId ?? null,
    messageId: input.messageId ?? null,
    type: input.type,
    title: input.title,
    description: input.description,
    timestamp: new Date(),
    user: input.user ?? null,
    metadata: input.metadata,
  });
  return serializeEvent(created.toObject());
}

async function resolveTemplateByIdOrKey(input: { templateId?: string | null; templateKey?: string | null }) {
  if (input.templateId) {
    const byId = await CommunicationTemplateModel.findById(input.templateId).lean();
    if (byId) {
      return serializeTemplate(byId);
    }
  }
  if (input.templateKey) {
    const byKey = await CommunicationTemplateModel.findOne({ key: input.templateKey.trim().toLowerCase() }).lean();
    if (byKey) {
      return serializeTemplate(byKey);
    }
  }
  return null;
}

function ensureTemplateCategory(template: CommunicationTemplate | null, expectedCategory: CommunicationCategory) {
  if (template && template.category !== expectedCategory) {
    throw new Error("Izbrana predloga ne pripada pravilni kategoriji komunikacije.");
  }
}

export function buildActorDisplayName(reqLike: {
  authEmployee?: { name?: string | null };
  user?: { email?: string | null };
  context?: { actorUserId?: string | null };
}) {
  return (
    reqLike.authEmployee?.name?.trim() ||
    reqLike.user?.email?.trim() ||
    reqLike.context?.actorUserId ||
    "system"
  );
}

function formatRoleLabel(role: string | null | undefined) {
  const normalized = sanitizeString(role).toUpperCase();
  if (!normalized) return "";
  switch (normalized) {
    case "ADMIN":
      return "Admin";
    case "SALES":
      return "Prodaja";
    case "EXECUTION":
      return "Izvedba";
    case "FINANCE":
      return "Finance";
    case "ORGANIZER":
      return "Organizator";
    default:
      return normalized.charAt(0) + normalized.slice(1).toLowerCase();
  }
}

function resolveSenderIdentity(
  senderSettings: CommunicationSenderSettings,
  actorProfile?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  } | null
) {
  return {
    senderName: sanitizeString(actorProfile?.name) || senderSettings.senderName,
    senderEmail: sanitizeString(actorProfile?.email).toLowerCase() || senderSettings.senderEmail,
    senderPhone: sanitizeString(actorProfile?.phone) || senderSettings.senderPhone || "",
    senderRole: sanitizeString(actorProfile?.role) || senderSettings.senderRole || "",
  };
}

export async function sendOfferCommunicationEmail(input: {
  projectId: string;
  offerId: string;
  to: unknown;
  cc?: unknown;
  bcc?: unknown;
  templateId?: string | null;
  templateKey?: string | null;
  subject?: string | null;
  body?: string | null;
  selectedAttachments?: CommunicationAttachmentType[];
  actorUserId?: string | null;
  actorDisplayName?: string | null;
  actorProfile?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  } | null;
}) {
  const senderSettings = await getCommunicationSenderSettings();
  if (!senderSettings.enabled) {
    throw new Error("Komunikacija po emailu ni omogočena.");
  }
  if (!senderSettings.senderName || !senderSettings.senderEmail) {
    throw new Error("Pošiljatelj ni pravilno nastavljen.");
  }

  const [project, offer, globalSettings] = await Promise.all([
    ProjectModel.findOne({ id: input.projectId }),
    OfferVersionModel.findOne({ _id: input.offerId, projectId: input.projectId }),
    getSettings(),
  ]);

  if (!project || !offer) {
    throw new Error("Projekt ali ponudba nista najdena.");
  }

  const effectiveSender = resolveSenderIdentity(senderSettings, input.actorProfile);

  const projectClient = await resolveProjectClient(project);
  const customerEmail = projectClient?.email?.trim() || "";
  const to = sanitizeEmailList(input.to);
  const cc = sanitizeEmailList(input.cc);
  const bcc = sanitizeEmailList(input.bcc);
  const resolvedRecipients = to.length > 0 ? to : customerEmail ? [customerEmail.toLowerCase()] : [];
  if (resolvedRecipients.length === 0) {
    throw new Error("Prejemnik emaila ni določen.");
  }

  const templateContext = buildTemplateContext({
    customerName: project.customer?.name ?? projectClient?.name ?? "",
    customerEmail: projectClient?.email ?? "",
    projectName: project.title ?? "",
    offerNumber: offer.documentNumber ?? offer.title ?? "",
    offerTotal: `${formatCurrency(offer.totalWithVat ?? offer.totalGrossAfterDiscount ?? offer.totalGross ?? 0)} EUR`,
    companyName: globalSettings.companyName ?? "",
    companyWebsite: globalSettings.website ?? "",
    companyAddress: globalSettings.address ?? "",
    companyEmail: globalSettings.email ?? "",
    companyPhone: globalSettings.phone ?? "",
    companyLogoUrl: toPublicLogoUrl(globalSettings.logoUrl),
    sender: {
      ...senderSettings,
      senderName: effectiveSender.senderName,
      senderEmail: effectiveSender.senderEmail,
      senderPhone: effectiveSender.senderPhone,
      senderRole: formatRoleLabel(effectiveSender.senderRole),
    },
  });

  const template = await resolveTemplateByIdOrKey({
    templateId: input.templateId ?? null,
    templateKey: input.templateKey ?? null,
  });
  ensureTemplateCategory(template, "offer_send");

  const renderedTemplate = template ? renderCommunicationTemplate(template, templateContext) : { subject: "", body: "" };
  const renderedFooter = renderCommunicationText(senderSettings.emailFooterTemplate, templateContext);
  const footerUsesLogo = (senderSettings.emailFooterTemplate ?? "").includes("{{company.logo}}");
  const inlineCompanyLogo = footerUsesLogo ? await resolveInlineCompanyLogo(globalSettings.logoUrl) : null;
  const renderedFooterHtml = renderCommunicationFooterHtmlForEmail(senderSettings.emailFooterTemplate, templateContext, {
    logoSrc: inlineCompanyLogo ? `cid:${inlineCompanyLogo.cid}` : toPublicEmailLogoUrl(globalSettings.logoUrl),
  });

  const subjectFinal = sanitizeString(input.subject) || renderedTemplate.subject;
  const bodyWithoutFooter = input.body?.toString().trim() || renderedTemplate.body;
  const bodyFinal = appendCommunicationFooter(bodyWithoutFooter, renderedFooter);
  if (!subjectFinal || !bodyFinal) {
    throw new Error("Zadeva in vsebina emaila sta obvezni.");
  }

  const bodyMainText = stripAppendedFooter(bodyWithoutFooter, renderedFooter);
  const escapedMainHtml = bodyMainText
    .split("\n")
    .map((line) =>
      line.trim()
        ? `<div style="margin:0 0 8px 0;">${escapeHtml(line)}</div>`
        : '<div style="height:8px;"></div>'
    )
    .join("");
  const htmlFinal = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">${escapedMainHtml}${
    renderedFooterHtml ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;">${renderedFooterHtml}</div>` : ""
  }</div>`;

  const selectedAttachments =
    Array.isArray(input.selectedAttachments) && input.selectedAttachments.length > 0
      ? input.selectedAttachments
      : template?.defaultAttachments ?? [];

  const attachments = await Promise.all(
    selectedAttachments.map((type) =>
      resolveCommunicationAttachment({ type, projectId: input.projectId, offerId: input.offerId })
    )
  );

  const selectedAttachmentRecords: CommunicationAttachmentRecord[] = attachments.map((attachment) => ({
    type: attachment.type,
    refId: attachment.refId,
    filename: attachment.filename,
  }));

  const baseMessage = {
    projectId: input.projectId,
    offerId: input.offerId,
    customerId: projectClient?.id ?? null,
    direction: "outbound" as const,
    channel: "email" as const,
    to: resolvedRecipients,
    cc,
    bcc,
    subjectFinal,
    bodyFinal,
    templateId: template?.id ?? null,
    templateKey: template?.key ?? null,
    selectedAttachments: selectedAttachmentRecords,
    sentByUserId: input.actorUserId ?? null,
  };

  try {
    const info = await sendEmail({
      from: `"${effectiveSender.senderName}" <${effectiveSender.senderEmail}>`,
      to: resolvedRecipients.join(", "),
      cc: cc.length > 0 ? cc.join(", ") : undefined,
      bcc: bcc.length > 0 ? bcc.join(", ") : undefined,
      replyTo: senderSettings.replyToEmail || undefined,
      subject: subjectFinal,
      text: bodyFinal,
      html: htmlFinal,
      attachments: [
        ...attachments.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        })),
        ...(inlineCompanyLogo
          ? [
              {
                filename: inlineCompanyLogo.filename,
                content: inlineCompanyLogo.content,
                contentType: inlineCompanyLogo.contentType,
                cid: inlineCompanyLogo.cid,
                contentDisposition: "inline" as const,
              },
            ]
          : []),
      ],
    });

    const message = await CommunicationMessageModel.create({
      ...baseMessage,
      status: "sent",
      sentAt: new Date(),
      providerMessageId: typeof info.messageId === "string" ? info.messageId : null,
    });

    await createCommunicationEvent({
      projectId: input.projectId,
      offerId: input.offerId,
      messageId: String(message._id),
      type: "email_sent",
      title: "Email poslan",
      description: `Poslano na ${resolvedRecipients.join(", ")}`,
      user: input.actorDisplayName ?? null,
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
        attachments: selectedAttachmentRecords.map((attachment) => attachment.filename).join(", "),
      },
    });

    return {
      message: serializeMessage(message.toObject()),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Pošiljanje emaila ni uspelo.";
    const message = await CommunicationMessageModel.create({
      ...baseMessage,
      status: "failed",
      sentAt: null,
      errorMessage,
    });
    await createCommunicationEvent({
      projectId: input.projectId,
      offerId: input.offerId,
      messageId: String(message._id),
      type: "email_failed",
      title: "Pošiljanje emaila ni uspelo",
      description: errorMessage,
      user: input.actorDisplayName ?? null,
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
      },
    });
    throw error;
  }
}

export async function sendWorkOrderConfirmationCommunicationEmail(input: {
  projectId: string;
  workOrderId: string;
  to: unknown;
  cc?: unknown;
  bcc?: unknown;
  templateId?: string | null;
  templateKey?: string | null;
  subject?: string | null;
  body?: string | null;
  selectedAttachments?: CommunicationAttachmentType[];
  actorUserId?: string | null;
  actorDisplayName?: string | null;
  actorProfile?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  } | null;
  allowSendWithoutSignature?: boolean;
}) {
  const senderSettings = await getCommunicationSenderSettings();
  if (!senderSettings.enabled) {
    throw new Error("Komunikacija po emailu ni omogočena.");
  }
  if (!senderSettings.senderName || !senderSettings.senderEmail) {
    throw new Error("Pošiljatelj ni pravilno nastavljen.");
  }

  const [project, workOrder, globalSettings] = await Promise.all([
    ProjectModel.findOne({ id: input.projectId }),
    WorkOrderModel.findOne({ _id: input.workOrderId, projectId: input.projectId }),
    getSettings(),
  ]);

  if (!project || !workOrder) {
    throw new Error("Projekt ali delovni nalog nista najdena.");
  }
  const activeConfirmationVersion = getActiveSignedConfirmationVersion(workOrder);
  const hasActiveSignedConfirmation =
    workOrder.confirmationState === "signed_active" &&
    Boolean(workOrder.confirmationActiveVersionId) &&
    Boolean(activeConfirmationVersion?.signedAt);
  if (!hasActiveSignedConfirmation) {
    throw new CommunicationValidationError(
      "WORK_ORDER_NOT_SIGNED",
      "Potrdilo delovnega naloga še ni podpisano."
    );
  }
  if (!activeConfirmationVersion) {
    throw new Error("Potrdilo delovnega naloga še ni podpisano.");
  }

  const effectiveSender = resolveSenderIdentity(senderSettings, input.actorProfile);
  const projectClient = await resolveProjectClient(project);
  const customerEmail = workOrder.customerEmail?.trim() || projectClient?.email?.trim() || "";
  const to = sanitizeEmailList(input.to);
  const cc = sanitizeEmailList(input.cc);
  const bcc = sanitizeEmailList(input.bcc);
  const resolvedRecipients = to.length > 0 ? to : customerEmail ? [customerEmail.toLowerCase()] : [];
  if (resolvedRecipients.length === 0) {
    throw new Error("Prejemnik emaila ni določen.");
  }

  const workOrderIdentifier =
    workOrder.code?.trim() ||
    workOrder.title?.trim() ||
    project.code?.trim() ||
    project.title?.trim() ||
    project.id ||
    input.workOrderId;

  const templateContext = buildTemplateContext({
    customerName: workOrder.customerName ?? project.customer?.name ?? projectClient?.name ?? "",
    customerEmail,
    projectName: project.title ?? "",
    offerNumber: "",
    offerTotal: "",
    workOrderIdentifier,
    confirmationDate: formatDate(activeConfirmationVersion.signedAt),
    companyName: globalSettings.companyName ?? "",
    companyWebsite: globalSettings.website ?? "",
    companyAddress: globalSettings.address ?? "",
    companyEmail: globalSettings.email ?? "",
    companyPhone: globalSettings.phone ?? "",
    companyLogoUrl: toPublicLogoUrl(globalSettings.logoUrl),
    sender: {
      ...senderSettings,
      senderName: effectiveSender.senderName,
      senderEmail: effectiveSender.senderEmail,
      senderPhone: effectiveSender.senderPhone,
      senderRole: formatRoleLabel(effectiveSender.senderRole),
    },
  });

  const template = await resolveTemplateByIdOrKey({
    templateId: input.templateId ?? null,
    templateKey: input.templateKey ?? null,
  });
  ensureTemplateCategory(template, "work_order_confirmation_send");

  const renderedTemplate = template ? renderCommunicationTemplate(template, templateContext) : { subject: "", body: "" };
  const renderedFooter = renderCommunicationText(senderSettings.emailFooterTemplate, templateContext);
  const footerUsesLogo = (senderSettings.emailFooterTemplate ?? "").includes("{{company.logo}}");
  const inlineCompanyLogo = footerUsesLogo ? await resolveInlineCompanyLogo(globalSettings.logoUrl) : null;
  const renderedFooterHtml = renderCommunicationFooterHtmlForEmail(senderSettings.emailFooterTemplate, templateContext, {
    logoSrc: inlineCompanyLogo ? `cid:${inlineCompanyLogo.cid}` : toPublicEmailLogoUrl(globalSettings.logoUrl),
  });

  const subjectFinal = sanitizeString(input.subject) || renderedTemplate.subject;
  const bodyWithoutFooter = input.body?.toString().trim() || renderedTemplate.body;
  const bodyFinal = appendCommunicationFooter(bodyWithoutFooter, renderedFooter);
  if (!subjectFinal || !bodyFinal) {
    throw new Error("Zadeva in vsebina emaila sta obvezni.");
  }

  const bodyMainText = stripAppendedFooter(bodyWithoutFooter, renderedFooter);
  const escapedMainHtml = bodyMainText
    .split("\n")
    .map((line) =>
      line.trim()
        ? `<div style="margin:0 0 8px 0;">${escapeHtml(line)}</div>`
        : '<div style="height:8px;"></div>'
    )
    .join("");
  const htmlFinal = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">${escapedMainHtml}${
    renderedFooterHtml ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;">${renderedFooterHtml}</div>` : ""
  }</div>`;

  const selectedAttachments = Array.from(
    new Set(
      (Array.isArray(input.selectedAttachments) && input.selectedAttachments.length > 0
        ? input.selectedAttachments
        : template?.defaultAttachments ?? ["work_order_confirmation_pdf"]
      ).concat("work_order_confirmation_pdf")
    )
  );

  const attachments = await Promise.all(
    selectedAttachments.map((type) =>
      resolveCommunicationAttachment({
        type,
        projectId: input.projectId,
        offerId: workOrder.offerVersionId ?? null,
        workOrderId: input.workOrderId,
      })
    )
  );

  const selectedAttachmentRecords: CommunicationAttachmentRecord[] = attachments.map((attachment) => ({
    type: attachment.type,
    refId: attachment.refId,
    filename: attachment.filename,
  }));

  const baseMessage = {
    projectId: input.projectId,
    offerId: workOrder.offerVersionId ?? null,
    customerId: projectClient?.id ?? null,
    direction: "outbound" as const,
    channel: "email" as const,
    to: resolvedRecipients,
    cc,
    bcc,
    subjectFinal,
    bodyFinal,
    templateId: template?.id ?? null,
    templateKey: template?.key ?? null,
    selectedAttachments: selectedAttachmentRecords,
    sentByUserId: input.actorUserId ?? null,
  };

  try {
    const info = await sendEmail({
      from: `"${effectiveSender.senderName}" <${effectiveSender.senderEmail}>`,
      to: resolvedRecipients.join(", "),
      cc: cc.length > 0 ? cc.join(", ") : undefined,
      bcc: bcc.length > 0 ? bcc.join(", ") : undefined,
      replyTo: senderSettings.replyToEmail || undefined,
      subject: subjectFinal,
      text: bodyFinal,
      html: htmlFinal,
      attachments: [
        ...attachments.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        })),
        ...(inlineCompanyLogo
          ? [
              {
                filename: inlineCompanyLogo.filename,
                content: inlineCompanyLogo.content,
                contentType: inlineCompanyLogo.contentType,
                cid: inlineCompanyLogo.cid,
                contentDisposition: "inline" as const,
              },
            ]
          : []),
      ],
    });

    const message = await CommunicationMessageModel.create({
      ...baseMessage,
      status: "sent",
      sentAt: new Date(),
      providerMessageId: typeof info.messageId === "string" ? info.messageId : null,
    });

    await createCommunicationEvent({
      projectId: input.projectId,
      offerId: workOrder.offerVersionId ?? null,
      messageId: String(message._id),
      type: "email_sent",
      title: "Email s potrdilom poslan",
      description: `Poslano na ${resolvedRecipients.join(", ")}`,
      user: input.actorDisplayName ?? null,
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
        workOrderId: input.workOrderId,
        attachments: selectedAttachmentRecords.map((attachment) => attachment.filename).join(", "),
      },
    });

    return {
      message: serializeMessage(message.toObject()),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Pošiljanje emaila ni uspelo.";
    const message = await CommunicationMessageModel.create({
      ...baseMessage,
      status: "failed",
      sentAt: null,
      errorMessage,
    });
    await createCommunicationEvent({
      projectId: input.projectId,
      offerId: workOrder.offerVersionId ?? null,
      messageId: String(message._id),
      type: "email_failed",
      title: "Pošiljanje emaila s potrdilom ni uspelo",
      description: errorMessage,
      user: input.actorDisplayName ?? null,
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
        workOrderId: input.workOrderId,
      },
    });
    throw error;
  }
}

export async function listProjectCommunicationFeed(projectId: string, limit = 20) {
  const events = await CommunicationEventModel.find({ projectId }).sort({ timestamp: -1 }).limit(limit).lean();
  return events.map(serializeEvent);
}

export async function listOfferMessages(projectId: string, offerId: string) {
  const messages = await CommunicationMessageModel.find({ projectId, offerId }).sort({ createdAt: -1 }).lean();
  return messages.map(serializeMessage);
}

export async function getCommunicationMessage(projectId: string, messageId: string) {
  const message = await CommunicationMessageModel.findOne({ _id: messageId, projectId }).lean();
  return message ? serializeMessage(message) : null;
}

export async function recordOfferConfirmedCommunicationEvent(input: {
  projectId: string;
  offerId: string;
  title?: string;
  description?: string;
  user?: string | null;
}) {
  return createCommunicationEvent({
    projectId: input.projectId,
    offerId: input.offerId,
    type: "offer_confirmed",
    title: input.title ?? "Ponudba potrjena",
    description: input.description ?? "Ponudba je bila poslovno potrjena.",
    user: input.user ?? null,
  });
}

export async function recordSignatureCompletedCommunicationEvent(input: {
  projectId: string;
  offerId?: string | null;
  signerName: string;
  user?: string | null;
}) {
  return createCommunicationEvent({
    projectId: input.projectId,
    offerId: input.offerId ?? null,
    type: "signature_completed",
    title: "Podpis zaključen",
    description: `Podpisal: ${input.signerName}`,
    user: input.user ?? null,
  });
}
