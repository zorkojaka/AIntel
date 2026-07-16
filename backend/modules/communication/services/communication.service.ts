import type {
  CommunicationAttachmentRecord,
  CommunicationAttachmentType,
  CommunicationCategory,
  CommunicationEvent,
  CommunicationMessage,
  CommunicationSenderSettings,
  CommunicationTemplate,
} from "../../../../shared/types/communication";
import { isValidObjectId } from "mongoose";
import { logger } from "../../../core/logger";
import { stripAppendedFooter } from "../../../../shared/utils/communication-footer";
import { CommunicationSenderSettingsModel } from "../schemas/sender-settings";
import { CommunicationTemplateModel } from "../schemas/template";
import { CommunicationMessageModel } from "../schemas/message";
import { CommunicationEventModel } from "../schemas/event";
import { buildThreadHeaders, type ThreadHeaders } from "./thread.service";
import {
  appendCommunicationFooter,
  renderCommunicationBodyHtml,
  renderCommunicationFooterHtmlForEmail,
  buildTemplateContext,
  renderCommunicationTemplate,
  renderCommunicationText,
} from "./template-render.service";
import { resolveCommunicationAttachment, type ResolvedAttachment } from "./attachment-resolver.service";
import { sendEmail } from "./email-transport.service";
import { ProjectModel } from "../../projects/schemas/project";
import { OfferVersionModel } from "../../projects/schemas/offer-version";
import { WorkOrderModel } from "../../projects/schemas/work-order";
import { EmployeeModel } from "../../employees/schemas/employee";
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
    invoiceVersionId: doc?.invoiceVersionId ?? null,
    workOrderId: doc?.workOrderId ?? null,
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

type InlineEmailAttachment = Awaited<ReturnType<typeof resolveInlineCompanyLogo>>;

async function sendAndRecordCommunicationEmail(input: {
  senderSettings: CommunicationSenderSettings;
  effectiveSender: {
    senderName: string;
    senderEmail: string;
  };
  recipients: string[];
  cc: string[];
  bcc: string[];
  subjectFinal: string;
  bodyFinal: string;
  htmlFinal: string;
  attachments: ResolvedAttachment[];
  inlineCompanyLogo: InlineEmailAttachment;
  baseMessage: Record<string, unknown>;
  actorDisplayName?: string | null;
  successEvent: {
    projectId: string;
    offerId?: string | null;
    title: string;
    metadata: Record<string, string>;
  };
  failureEvent: {
    projectId: string;
    offerId?: string | null;
    title: string;
    metadata: Record<string, string>;
  };
  onSentLoggingFailed?: (error: unknown) => { message: null; sent: true; loggingFailed: true };
}) {
  const attachmentFiles = input.attachments.map((attachment) => ({
    filename: attachment.filename,
    content: attachment.content,
    contentType: attachment.contentType,
  }));
  const inlineLogoFiles = input.inlineCompanyLogo
    ? [
        {
          filename: input.inlineCompanyLogo.filename,
          content: input.inlineCompanyLogo.content,
          contentType: input.inlineCompanyLogo.contentType,
          cid: input.inlineCompanyLogo.cid,
          contentDisposition: "inline" as const,
        },
      ]
    : [];

  // Nit pogovora: novo sporocilo se pripne na zadnji clen (nase ali strankin).
  // Interna posta (monterji) ne nosi glav niti s stranko — monter referenciranega
  // sporocila nima, nit pa je pogovor s stranko, ne z ekipo.
  // Napaka pri branju niti ne sme ustaviti posiljanja — sporocilo raje odide
  // brez nitenja, kot da ne odide.
  const internalAudience = (input.baseMessage as { audience?: string }).audience === "internal";
  let thread: ThreadHeaders = {};
  if (!internalAudience) {
    try {
      thread = await buildThreadHeaders(input.successEvent.projectId);
    } catch (error) {
      console.error("Nitenja ni bilo mogoce sestaviti, posiljam brez njega.", error);
    }
  }

  let providerMessageId: string | null = null;
  try {
    const info = await sendEmail({
      from: `"${input.effectiveSender.senderName}" <${input.effectiveSender.senderEmail}>`,
      to: input.recipients.join(", "),
      cc: input.cc.length > 0 ? input.cc.join(", ") : undefined,
      bcc: input.bcc.length > 0 ? input.bcc.join(", ") : undefined,
      replyTo: input.senderSettings.replyToEmail || undefined,
      subject: input.subjectFinal,
      inReplyTo: thread.inReplyTo,
      references: thread.references,
      text: input.bodyFinal,
      html: input.htmlFinal,
      attachments: [...attachmentFiles, ...inlineLogoFiles],
    });
    providerMessageId = typeof info.messageId === "string" ? info.messageId : null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Pošiljanje emaila ni uspelo.";
    const message = await CommunicationMessageModel.create({
      ...input.baseMessage,
      status: "failed",
      sentAt: null,
      errorMessage,
    });
    await createCommunicationEvent({
      projectId: input.failureEvent.projectId,
      offerId: input.failureEvent.offerId ?? null,
      messageId: String(message._id),
      type: "email_failed",
      title: input.failureEvent.title,
      description: errorMessage,
      user: input.actorDisplayName ?? null,
      metadata: input.failureEvent.metadata,
    });
    throw error;
  }

  try {
    const message = await CommunicationMessageModel.create({
      ...input.baseMessage,
      status: "sent",
      sentAt: new Date(),
      providerMessageId,
      references: thread.references ?? [],
    });

    await createCommunicationEvent({
      projectId: input.successEvent.projectId,
      offerId: input.successEvent.offerId ?? null,
      messageId: String(message._id),
      type: "email_sent",
      title: input.successEvent.title,
      description: `Poslano na ${input.recipients.join(", ")}`,
      user: input.actorDisplayName ?? null,
      metadata: input.successEvent.metadata,
    });

    return { message: serializeMessage(message.toObject()) };
  } catch (error) {
    if (input.onSentLoggingFailed) {
      return input.onSentLoggingFailed(error);
    }
    throw error;
  }
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
  _actorProfile?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  } | null
) {
  return {
    senderName: senderSettings.senderName,
    senderEmail: senderSettings.senderEmail,
    senderPhone: senderSettings.senderPhone || "",
    senderRole: senderSettings.senderRole || "",
  };
}

export async function sendInvoiceCommunicationEmail(input: {
  projectId: string;
  invoiceVersionId: string;
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

  const [project, globalSettings] = await Promise.all([
    ProjectModel.findOne({ id: input.projectId }),
    getSettings(),
  ]);
  const invoice = (project?.invoiceVersions ?? []).find((entry: any) => String(entry?._id) === input.invoiceVersionId);

  if (!project || !invoice) {
    throw new Error("Projekt ali račun nista najdena.");
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

  const invoiceIdentifier = invoice.invoiceNumber || `verzija ${invoice.versionNumber ?? input.invoiceVersionId}`;
  const invoiceTotal = `${formatCurrency(Number(invoice.summary?.totalWithVat ?? 0))} EUR`;
  const templateContext = buildTemplateContext({
    customerName: project.customer?.name ?? projectClient?.name ?? "",
    customerEmail: projectClient?.email ?? "",
    projectName: project.title ?? "",
    offerNumber: "",
    offerTotal: "",
    invoiceNumber: invoiceIdentifier,
    invoiceTotal,
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
  ensureTemplateCategory(template, "invoice_send");

  const renderedTemplate = template ? renderCommunicationTemplate(template, templateContext) : { subject: "", body: "" };
  const renderedFooter = renderCommunicationText(senderSettings.emailFooterTemplate, templateContext);
  const footerUsesLogo = (senderSettings.emailFooterTemplate ?? "").includes("{{company.logo}}");
  const inlineCompanyLogo = footerUsesLogo ? await resolveInlineCompanyLogo(globalSettings.logoUrl) : null;
  const renderedFooterHtml = renderCommunicationFooterHtmlForEmail(senderSettings.emailFooterTemplate, templateContext, {
    logoSrc: inlineCompanyLogo ? `cid:${inlineCompanyLogo.cid}` : toPublicEmailLogoUrl(globalSettings.logoUrl),
  });

  const subjectFinal = sanitizeString(input.subject) || renderedTemplate.subject || `Račun ${invoiceIdentifier}`;
  const bodyWithoutFooter =
    input.body?.toString().trim() ||
    renderedTemplate.body ||
    [
      `Spoštovani,`,
      "",
      `v priponki vam pošiljamo račun ${invoiceIdentifier}.`,
      "",
      "Lep pozdrav",
    ].join("\n");
  const bodyFinal = appendCommunicationFooter(bodyWithoutFooter, renderedFooter);

  const bodyMainText = stripAppendedFooter(bodyWithoutFooter, renderedFooter);
  const htmlFinal = renderCommunicationBodyHtml(bodyMainText, renderedFooterHtml);

  const selectedAttachments = Array.from(
    new Set(
      (Array.isArray(input.selectedAttachments) && input.selectedAttachments.length > 0
        ? input.selectedAttachments
        : template?.defaultAttachments ?? ["invoice_pdf"]
      ).concat("invoice_pdf")
    )
  );
  const attachments = await Promise.all(
    selectedAttachments.map((type) =>
      resolveCommunicationAttachment({
        type,
        projectId: input.projectId,
        invoiceVersionId: input.invoiceVersionId,
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
    offerId: null,
    invoiceVersionId: input.invoiceVersionId,
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

  return sendAndRecordCommunicationEmail({
    senderSettings,
    effectiveSender,
    recipients: resolvedRecipients,
    cc,
    bcc,
    subjectFinal,
    bodyFinal,
    htmlFinal,
    attachments,
    inlineCompanyLogo,
    baseMessage,
    actorDisplayName: input.actorDisplayName ?? null,
    successEvent: {
      projectId: input.projectId,
      title: "Email z računom poslan",
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
        invoiceVersionId: input.invoiceVersionId,
        attachments: selectedAttachmentRecords.map((attachment) => attachment.filename).join(", "),
      },
    },
    failureEvent: {
      projectId: input.projectId,
      title: "Pošiljanje emaila z računom ni uspelo",
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
        invoiceVersionId: input.invoiceVersionId,
      },
    },
  });
}

export async function sendOfferCommunicationEmail(input: {
  projectId: string;
  offerId: string;
  selectedOfferIds?: string[];
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

  const explicitSelectedOfferIds = Array.isArray(input.selectedOfferIds)
    ? input.selectedOfferIds.map((entry) => sanitizeString(entry)).filter(Boolean)
    : [];
  const selectedOfferIds = Array.from(new Set(explicitSelectedOfferIds.length > 0 ? explicitSelectedOfferIds : [input.offerId]));

  const [project, offer, selectedOffers, globalSettings] = await Promise.all([
    ProjectModel.findOne({ id: input.projectId }),
    OfferVersionModel.findOne({ _id: input.offerId, projectId: input.projectId }),
    OfferVersionModel.find({ _id: { $in: selectedOfferIds }, projectId: input.projectId }).lean(),
    getSettings(),
  ]);

  if (!project || !offer) {
    throw new Error("Projekt ali ponudba nista najdena.");
  }
  if (selectedOfferIds.length > 0 && selectedOffers.length !== selectedOfferIds.length) {
    throw new Error("Ena ali vec izbranih verzij ponudbe ni najdena.");
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
  const htmlFinal = renderCommunicationBodyHtml(bodyMainText, renderedFooterHtml);

  const selectedAttachments =
    Array.isArray(input.selectedAttachments) && input.selectedAttachments.length > 0
      ? input.selectedAttachments
      : template?.defaultAttachments ?? [];

  const offerAttachmentTypes = selectedAttachments.filter((type) => type === "offer_pdf" || type === "project_pdf");
  const otherAttachmentTypes = selectedAttachments.filter((type) => type !== "offer_pdf" && type !== "project_pdf");
  const attachmentRequests = [
    ...offerAttachmentTypes.flatMap((type) =>
      selectedOfferIds.map((selectedOfferId) => ({
        type,
        projectId: input.projectId,
        offerId: selectedOfferId,
      }))
    ),
    ...otherAttachmentTypes.map((type) => ({
      type,
      projectId: input.projectId,
      offerId: input.offerId,
    })),
  ];
  const attachments = await Promise.all(attachmentRequests.map((params) => resolveCommunicationAttachment(params)));

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

  return sendAndRecordCommunicationEmail({
    senderSettings,
    effectiveSender,
    recipients: resolvedRecipients,
    cc,
    bcc,
    subjectFinal,
    bodyFinal,
    htmlFinal,
    attachments,
    inlineCompanyLogo,
    baseMessage,
    actorDisplayName: input.actorDisplayName ?? null,
    successEvent: {
      projectId: input.projectId,
      offerId: input.offerId,
      title: "Email poslan",
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
        attachments: selectedAttachmentRecords.map((attachment) => attachment.filename).join(", "),
      },
    },
    failureEvent: {
      projectId: input.projectId,
      offerId: input.offerId,
      title: "Pošiljanje emaila ni uspelo",
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
      },
    },
  });
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
  const htmlFinal = renderCommunicationBodyHtml(bodyMainText, renderedFooterHtml);

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
    workOrderId: input.workOrderId,
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

  return sendAndRecordCommunicationEmail({
    senderSettings,
    effectiveSender,
    recipients: resolvedRecipients,
    cc,
    bcc,
    subjectFinal,
    bodyFinal,
    htmlFinal,
    attachments,
    inlineCompanyLogo,
    baseMessage,
    actorDisplayName: input.actorDisplayName ?? null,
    successEvent: {
      projectId: input.projectId,
      offerId: workOrder.offerVersionId ?? null,
      title: "Email s potrdilom poslan",
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
        workOrderId: input.workOrderId,
        attachments: selectedAttachmentRecords.map((attachment) => attachment.filename).join(", "),
      },
    },
    failureEvent: {
      projectId: input.projectId,
      offerId: workOrder.offerVersionId ?? null,
      title: "Pošiljanje emaila s potrdilom ni uspelo",
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
        workOrderId: input.workOrderId,
      },
    },
  });
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sl-SI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function appendSection(lines: string[], title: string, values: Array<string | null | undefined>) {
  const normalized = values.map((value) => sanitizeString(value)).filter(Boolean);
  if (normalized.length === 0) return;
  lines.push("", title);
  normalized.forEach((value) => lines.push(value));
}

function formatWorkOrderExecutionDefinition(workOrder: any) {
  const lines: string[] = [];
  for (const item of workOrder.items ?? []) {
    const spec = item?.executionSpec ?? null;
    const units = Array.isArray(spec?.executionUnits) ? spec.executionUnits : [];
    const itemLines: string[] = [];
    if (sanitizeString(spec?.locationSummary)) itemLines.push(`Lokacije: ${sanitizeString(spec.locationSummary)}`);
    if (sanitizeString(spec?.instructions)) itemLines.push(`Opomba: ${sanitizeString(spec.instructions)}`);
    units.forEach((unit: any, index: number) => {
      const label = sanitizeString(unit?.label) || `${index + 1}`;
      const location = sanitizeString(unit?.location);
      const instructions = sanitizeString(unit?.instructions);
      const parts = [`${label}${location ? ` - ${location}` : ""}`];
      if (instructions) parts.push(`opomba: ${instructions}`);
      itemLines.push(`- ${parts.join(", ")}`);
    });
    if (itemLines.length > 0) {
      lines.push(`${sanitizeString(item?.name) || "Postavka"}:`);
      lines.push(...itemLines);
    }
  }
  return lines;
}

export function normalizeWorkOrderObjectId(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && isValidObjectId(normalized) ? normalized : null;
}

export async function sendInstallerPreparationEmail(input: {
  projectId: string;
  workOrderId: string;
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: string | null;
  body?: string | null;
  projectLink?: string | null;
  previewOnly?: boolean;
  actorUserId?: string | null;
  actorDisplayName?: string | null;
  actorProfile?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  } | null;
}) {
  const workOrderId = normalizeWorkOrderObjectId(input.workOrderId);
  if (!workOrderId) {
    throw new Error("Delovni nalog ni pravilno določen.");
  }

  const senderSettings = await getCommunicationSenderSettings();
  if (!senderSettings.enabled) {
    throw new Error("Komunikacija po emailu ni omogočena.");
  }
  if (!senderSettings.senderName || !senderSettings.senderEmail) {
    throw new Error("Pošiljatelj ni pravilno nastavljen.");
  }

  const [project, workOrder, globalSettings] = await Promise.all([
    ProjectModel.findOne({ id: input.projectId }),
    WorkOrderModel.findOne({ _id: workOrderId, projectId: input.projectId }),
    getSettings(),
  ]);

  if (!project || !workOrder) {
    throw new Error("Projekt ali delovni nalog nista najdena.");
  }

  const installerIds = Array.from(
    new Set(
      [
        workOrder.mainInstallerId ? String(workOrder.mainInstallerId) : "",
        ...(Array.isArray(workOrder.assignedEmployeeIds) ? workOrder.assignedEmployeeIds.map((id: any) => String(id)) : []),
      ].filter(Boolean)
    )
  );
  if (installerIds.length === 0) {
    throw new Error("Monter na delovnem nalogu ni določen.");
  }

  const installers = await EmployeeModel.find({ _id: { $in: installerIds }, deletedAt: null }).lean();
  const installerById = new Map<string, any>(installers.map((installer: any) => [String(installer._id), installer]));
  const selectedRecipients = sanitizeEmailList(input.to);
  const primaryInstaller = installerIds.map((id) => installerById.get(id)).find((installer) => sanitizeString(installer?.email));
  if (!primaryInstaller && selectedRecipients.length === 0) {
    throw new Error("Monter nima nastavljenega emaila.");
  }

  const effectiveSender = resolveSenderIdentity(senderSettings, input.actorProfile);
  const projectClient = await resolveProjectClient(project);
  const offer = workOrder.offerVersionId
    ? await OfferVersionModel.findOne({ _id: workOrder.offerVersionId, projectId: input.projectId }).lean()
    : null;

  const customerName = workOrder.customerName || project.customer?.name || projectClient?.name || "";
  const customerAddress = workOrder.customerAddress || project.customer?.address || projectClient?.address || "";
  const customerEmail = workOrder.customerEmail || projectClient?.email || "";
  const customerPhone = workOrder.customerPhone || projectClient?.phone || "";
  const schedule = formatDateTime(workOrder.scheduledAt);
  const teamNames = installerIds
    .map((id) => installerById.get(id)?.name)
    .map((name) => sanitizeString(name))
    .filter(Boolean);
  const projectIdentifier = project.code || project.id || input.projectId;
  const workOrderIdentifier = workOrder.code || workOrder.title || String(workOrder._id);

  const bodyLines: string[] = [
    `Pozdravljen ${primaryInstaller?.name || "monter"},`,
    "",
    `Pošiljamo podatke za pripravo na montažo in potrditev termina za projekt ${projectIdentifier}${project.title ? ` - ${project.title}` : ""}.`,
  ];
  appendSection(bodyLines, "Termin", [
    schedule ? `Termin izvedbe: ${schedule}` : "Termin izvedbe: ni določen",
    workOrder.scheduledConfirmedAt ? `Termin potrjen: ${formatDateTime(workOrder.scheduledConfirmedAt)}` : null,
    teamNames.length > 0 ? `Ekipa: ${teamNames.join(", ")}` : null,
  ]);
  appendSection(bodyLines, "Stranka", [
    customerName,
    customerAddress,
    customerEmail ? `Email: ${customerEmail}` : null,
    customerPhone ? `Telefon: ${customerPhone}` : null,
    project.customer?.taxId ? `Davčna: ${project.customer.taxId}` : null,
  ]);
  appendSection(bodyLines, "Opombe", [
    project.requirementsText ? `Projekt: ${project.requirementsText}` : null,
    offer?.comment ? `Ponudba: ${offer.comment}` : null,
    workOrder.notes ? `Delovni nalog: ${workOrder.notes}` : null,
    workOrder.executionNote ? `Izvedba: ${workOrder.executionNote}` : null,
  ]);
  const itemLines = (workOrder.items ?? []).map((item: any) => {
    const quantity = typeof item.quantity === "number" ? item.quantity : item.plannedQuantity ?? "";
    return `- ${item.name || "Postavka"} (${quantity} ${item.unit || ""})`;
  });
  appendSection(bodyLines, "Postavke delovnega naloga", itemLines);
  appendSection(bodyLines, "Definicija izvedbe", formatWorkOrderExecutionDefinition(workOrder));
  appendSection(bodyLines, "Povezava", [
    input.projectLink ? `Projekt/delovni nalog: ${input.projectLink}` : null,
  ]);
  bodyLines.push("", "Delovni nalog je priložen v PDF priponki.", "", "Lep pozdrav");

  const templateContext = buildTemplateContext({
    customerName,
    customerEmail,
    projectName: project.title ?? "",
    offerNumber: offer?.documentNumber ?? offer?.title ?? "",
    offerTotal: "",
    workOrderIdentifier,
    confirmationDate: schedule,
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

  const renderedFooter = renderCommunicationText(senderSettings.emailFooterTemplate, templateContext);
  const footerUsesLogo = (senderSettings.emailFooterTemplate ?? "").includes("{{company.logo}}");
  const inlineCompanyLogo = footerUsesLogo ? await resolveInlineCompanyLogo(globalSettings.logoUrl) : null;
  const renderedFooterHtml = renderCommunicationFooterHtmlForEmail(senderSettings.emailFooterTemplate, templateContext, {
    logoSrc: inlineCompanyLogo ? `cid:${inlineCompanyLogo.cid}` : toPublicEmailLogoUrl(globalSettings.logoUrl),
  });

  const subjectFinal = sanitizeString(input.subject) || `Priprava montaže: ${projectIdentifier}${schedule ? ` - ${schedule}` : ""}`;
  const bodyWithoutFooter = input.body?.toString().trim() || bodyLines.join("\n");
  const resolvedRecipients = selectedRecipients.length > 0 ? selectedRecipients : [String(primaryInstaller.email).toLowerCase()];
  const cc = sanitizeEmailList(input.cc);
  const bcc = sanitizeEmailList(input.bcc);
  if (input.previewOnly) {
    return {
      draft: {
        to: resolvedRecipients.join(", "),
        cc: cc.join(", "),
        bcc: bcc.join(", "),
        subject: subjectFinal,
        body: bodyWithoutFooter,
      },
    };
  }
  const bodyFinal = appendCommunicationFooter(bodyWithoutFooter, renderedFooter);
  const htmlFinal = renderCommunicationBodyHtml(bodyWithoutFooter, renderedFooterHtml);

  const attachment = await resolveCommunicationAttachment({
    type: "work_order_pdf",
    projectId: input.projectId,
    offerId: workOrder.offerVersionId ?? null,
    workOrderId,
  });
  const selectedAttachmentRecords: CommunicationAttachmentRecord[] = [{
    type: attachment.type,
    refId: attachment.refId,
    filename: attachment.filename,
  }];
  const baseMessage = {
    projectId: input.projectId,
    offerId: workOrder.offerVersionId ?? null,
    workOrderId,
    customerId: projectClient?.id ?? null,
    audience: "internal" as const,
    direction: "outbound" as const,
    channel: "email" as const,
    to: resolvedRecipients,
    cc,
    bcc,
    subjectFinal,
    bodyFinal,
    templateId: null,
    templateKey: null,
    selectedAttachments: selectedAttachmentRecords,
    sentByUserId: input.actorUserId ?? null,
  };

  const payload = await sendAndRecordCommunicationEmail({
    senderSettings,
    effectiveSender,
    recipients: resolvedRecipients,
    cc,
    bcc,
    subjectFinal,
    bodyFinal,
    htmlFinal,
    attachments: [attachment],
    inlineCompanyLogo,
    baseMessage,
    actorDisplayName: input.actorDisplayName ?? null,
    successEvent: {
      projectId: input.projectId,
      offerId: workOrder.offerVersionId ?? null,
      title: "Email monterju poslan",
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
        workOrderId,
        attachments: selectedAttachmentRecords.map((record) => record.filename).join(", "),
      },
    },
    failureEvent: {
      projectId: input.projectId,
      offerId: workOrder.offerVersionId ?? null,
      title: "Pošiljanje emaila monterju ni uspelo",
      metadata: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
        workOrderId,
      },
    },
    onSentLoggingFailed: (loggingError) => {
      logger.error({ err: loggingError }, "Installer preparation email was sent, but communication logging failed");
      return { message: null, sent: true, loggingFailed: true };
    },
  });
  return { ...payload, sent: true };
}

export async function listProjectCommunicationFeed(projectId: string, limit = 20) {
  const events = await CommunicationEventModel.find({ projectId }).sort({ timestamp: -1 }).limit(limit).lean();
  return events.map(serializeEvent);
}

export async function listOfferMessages(projectId: string, offerId: string) {
  const messages = await CommunicationMessageModel.find({ projectId, offerId }).sort({ createdAt: -1 }).lean();
  return messages.map(serializeMessage);
}

export async function listInstallerPreparationMessages(projectId: string, workOrderId: string) {
  const messages = await CommunicationMessageModel.find({
    projectId,
    workOrderId,
    "selectedAttachments.type": "work_order_pdf",
  })
    .sort({ createdAt: -1 })
    .lean();
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

/**
 * Vabilo stranki, da si sama izbere dan montaže (rezervacijska povezava).
 * Brez predloge in prilog — kratko sporočilo s povezavo; zabeleži se kot vsa
 * ostala pošta projekta (nit, dnevnik, dogodki).
 */
export async function sendBookingInviteEmail(input: {
  projectId: string;
  workOrderId: string;
  bookingLink: string;
  durationHours: number;
  to?: unknown;
  subject?: string | null;
  body?: string | null;
  previewOnly?: boolean;
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

  const [project, globalSettings] = await Promise.all([
    ProjectModel.findOne({ id: input.projectId }),
    getSettings(),
  ]);
  if (!project) {
    throw new Error("Projekt ni najden.");
  }

  const effectiveSender = resolveSenderIdentity(senderSettings, input.actorProfile);
  const projectClient = await resolveProjectClient(project);
  const customerEmail = projectClient?.email?.trim() || "";
  const to = sanitizeEmailList(input.to);
  const resolvedRecipients = to.length > 0 ? to : customerEmail ? [customerEmail.toLowerCase()] : [];
  if (resolvedRecipients.length === 0) {
    throw new Error("Stranka nima nastavljenega e-naslova.");
  }

  const templateContext = buildTemplateContext({
    customerName: project.customer?.name ?? projectClient?.name ?? "",
    customerEmail: projectClient?.email ?? "",
    projectName: project.title ?? "",
    offerNumber: "",
    offerTotal: "",
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

  const renderedFooter = renderCommunicationText(senderSettings.emailFooterTemplate, templateContext);
  const footerUsesLogo = (senderSettings.emailFooterTemplate ?? "").includes("{{company.logo}}");
  const inlineCompanyLogo = footerUsesLogo ? await resolveInlineCompanyLogo(globalSettings.logoUrl) : null;
  const renderedFooterHtml = renderCommunicationFooterHtmlForEmail(senderSettings.emailFooterTemplate, templateContext, {
    logoSrc: inlineCompanyLogo ? `cid:${inlineCompanyLogo.cid}` : toPublicEmailLogoUrl(globalSettings.logoUrl),
  });

  const customerFirstLine = (project.customer?.name ?? projectClient?.name ?? "").trim();
  const subjectFinal = sanitizeString(input.subject) || `Izbira termina montaže — ${project.title ?? input.projectId}`;
  const defaultBody = [
    customerFirstLine ? `Spoštovani ${customerFirstLine},` : "Spoštovani,",
    "",
    "vaša montaža je pripravljena. Prosimo, izberite dan, ki vam najbolj ustreza — na spodnji povezavi so samo dnevi, ko je naša ekipa res na voljo:",
    "",
    input.bookingLink,
    "",
    `Predvideno trajanje izvedbe: približno ${input.durationHours} ${input.durationHours === 1 ? "ura" : input.durationHours === 2 ? "uri" : "ure"}.`,
    "Z izbiro dneva je termin potrjen; če vam noben termin ne ustreza, nas pokličite.",
    "",
    "Lep pozdrav",
  ].join("\n");
  const bodyWithoutFooter = input.body?.toString().trim() || defaultBody;
  if (input.previewOnly) {
    return {
      draft: {
        to: resolvedRecipients.join(", "),
        subject: subjectFinal,
        body: bodyWithoutFooter,
      },
    };
  }
  const bodyFinal = appendCommunicationFooter(bodyWithoutFooter, renderedFooter);
  const bodyMainText = stripAppendedFooter(bodyWithoutFooter, renderedFooter);
  const htmlFinal = renderCommunicationBodyHtml(bodyMainText, renderedFooterHtml);

  const baseMessage = {
    projectId: input.projectId,
    offerId: null,
    workOrderId: input.workOrderId,
    customerId: projectClient?.id ?? null,
    direction: "outbound" as const,
    channel: "email" as const,
    to: resolvedRecipients,
    cc: [] as string[],
    bcc: [] as string[],
    subjectFinal,
    bodyFinal,
    templateId: null,
    templateKey: null,
    selectedAttachments: [] as CommunicationAttachmentRecord[],
    sentByUserId: input.actorUserId ?? null,
  };

  return sendAndRecordCommunicationEmail({
    senderSettings,
    effectiveSender,
    recipients: resolvedRecipients,
    cc: [],
    bcc: [],
    subjectFinal,
    bodyFinal,
    htmlFinal,
    attachments: [],
    inlineCompanyLogo,
    baseMessage,
    actorDisplayName: input.actorDisplayName ?? null,
    successEvent: {
      projectId: input.projectId,
      offerId: null,
      title: "Vabilo k izbiri termina poslano",
      metadata: { to: resolvedRecipients.join(", "), subject: subjectFinal },
    },
    failureEvent: {
      projectId: input.projectId,
      offerId: null,
      title: "Vabila k izbiri termina ni bilo mogoče poslati",
      metadata: { to: resolvedRecipients.join(", "), subject: subjectFinal },
    },
  });
}
