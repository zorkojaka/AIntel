import type { CommunicationSenderSettings, CommunicationTemplate } from "../../../../shared/types/communication";
import {
  appendCommunicationFooter as appendSharedCommunicationFooter,
  renderCommunicationFooterHtml as renderSharedCommunicationFooterHtml,
  renderCommunicationFooterPreviewHtml,
  renderCommunicationFooterText,
  type CommunicationFooterRenderContext,
} from "../../../../shared/utils/communication-footer";

interface TemplateContext {
  customer: { name: string; email: string };
  project: { name: string };
  offer: { number: string; total: string };
  invoice: { number: string; total: string };
  workOrder: { identifier: string; confirmationDate: string };
  company: {
    name: string;
    website: string;
    address: string;
    email: string;
    phone: string;
    logoUrl: string;
  };
  sender: { name: string; email: string; phone: string; role: string };
}

const TOKEN_MAP: Record<string, (context: TemplateContext) => string> = {
  "{{customer.name}}": (context) => context.customer.name,
  "{{customer.email}}": (context) => context.customer.email,
  "{{project.name}}": (context) => context.project.name,
  "{{offer.number}}": (context) => context.offer.number,
  "{{offer.total}}": (context) => context.offer.total,
  "{{invoice.number}}": (context) => context.invoice.number,
  "{{invoice.total}}": (context) => context.invoice.total,
  "{{workOrder.identifier}}": (context) => context.workOrder.identifier,
  "{{confirmation.date}}": (context) => context.workOrder.confirmationDate,
  "{{company.name}}": (context) => context.company.name,
  "{{company.website}}": (context) => context.company.website,
  "{{company.address}}": (context) => context.company.address,
  "{{company.logo}}": () => "",
  "{{company.phone}}": (context) => context.company.phone,
  "{{company.email}}": (context) => context.company.email,
  "{{sender.name}}": (context) => context.sender.name,
  "{{sender.email}}": (context) => context.sender.email,
  "{{sender.phone}}": (context) => context.sender.phone,
  "{{sender.role}}": (context) => context.sender.role,
};

function replaceTokens(template: string, context: TemplateContext) {
  let output = template ?? "";
  Object.entries(TOKEN_MAP).forEach(([token, resolver]) => {
    output = output.split(token).join(resolver(context));
  });
  return output;
}

function normalizeMultiline(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toFooterContext(context: TemplateContext): CommunicationFooterRenderContext {
  return {
    sender: context.sender,
    company: context.company,
  };
}

export function renderCommunicationTemplate(
  template: Pick<CommunicationTemplate, "subjectTemplate" | "bodyTemplate">,
  context: TemplateContext
) {
  return {
    subject: normalizeMultiline(replaceTokens(template.subjectTemplate ?? "", context)),
    body: normalizeMultiline(replaceTokens(template.bodyTemplate ?? "", context)),
  };
}

export function renderCommunicationText(template: string | null | undefined, context: TemplateContext) {
  return renderCommunicationFooterText(template, toFooterContext(context));
}

export function renderCommunicationFooterHtml(template: string | null | undefined, context: TemplateContext) {
  return renderCommunicationFooterPreviewHtml(template, toFooterContext(context));
}

export function renderCommunicationFooterHtmlForEmail(
  template: string | null | undefined,
  context: TemplateContext,
  options?: { logoSrc?: string | null }
) {
  return renderSharedCommunicationFooterHtml(template, toFooterContext(context), options);
}

export function appendCommunicationFooter(body: string, renderedFooter: string) {
  return appendSharedCommunicationFooter(body, renderedFooter);
}

export function renderCommunicationBodyHtml(body: string, renderedFooterHtml?: string | null) {
  const escapedMainHtml = normalizeMultiline(body ?? "")
    .split("\n")
    .map((line) =>
      line.trim()
        ? `<div style="margin:0 0 8px 0;">${escapeHtml(line)}</div>`
        : '<div style="height:8px;"></div>'
    )
    .join("");
  const footerHtml = normalizeMultiline(renderedFooterHtml ?? "");
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">${escapedMainHtml}${
    footerHtml ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;">${footerHtml}</div>` : ""
  }</div>`;
}

export function buildTemplateContext(input: {
  customerName: string;
  customerEmail?: string;
  projectName: string;
  offerNumber: string;
  offerTotal: string;
  invoiceNumber?: string;
  invoiceTotal?: string;
  workOrderIdentifier?: string;
  confirmationDate?: string;
  companyName: string;
  companyWebsite?: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyLogoUrl?: string;
  sender: CommunicationSenderSettings;
}): TemplateContext {
  return {
    customer: { name: input.customerName || "", email: input.customerEmail || "" },
    project: { name: input.projectName || "" },
    offer: { number: input.offerNumber || "", total: input.offerTotal || "" },
    invoice: { number: input.invoiceNumber || "", total: input.invoiceTotal || "" },
    workOrder: {
      identifier: input.workOrderIdentifier || "",
      confirmationDate: input.confirmationDate || "",
    },
    company: {
      name: input.companyName || "",
      website: input.companyWebsite || "",
      address: input.companyAddress || "",
      email: input.companyEmail || "",
      phone: input.companyPhone || "",
      logoUrl: input.companyLogoUrl || "",
    },
    sender: {
      name: input.sender.senderName || "",
      email: input.sender.senderEmail || "",
      phone: input.sender.senderPhone || "",
      role: input.sender.senderRole || "",
    },
  };
}
