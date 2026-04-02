export interface CommunicationFooterRenderContext {
  sender: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  };
  company: {
    name?: string | null;
    website?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    logoUrl?: string | null;
  };
}

interface CommunicationFooterHtmlOptions {
  logoSrc?: string | null;
}

const TOKEN_RESOLVERS: Record<string, (context: CommunicationFooterRenderContext) => string> = {
  "{{sender.name}}": (context) => normalizeValue(context.sender.name),
  "{{sender.email}}": (context) => normalizeValue(context.sender.email),
  "{{sender.phone}}": (context) => normalizeValue(context.sender.phone),
  "{{sender.role}}": (context) => normalizeValue(context.sender.role),
  "{{company.name}}": (context) => normalizeValue(context.company.name),
  "{{company.website}}": (context) => normalizeValue(context.company.website),
  "{{company.address}}": (context) => normalizeValue(context.company.address),
  "{{company.email}}": (context) => normalizeValue(context.company.email),
  "{{company.phone}}": (context) => normalizeValue(context.company.phone),
  "{{company.logo}}": () => "",
};

function normalizeValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function replaceTextTokens(template: string, context: CommunicationFooterRenderContext) {
  let output = template ?? "";
  Object.entries(TOKEN_RESOLVERS).forEach(([token, resolver]) => {
    output = output.split(token).join(resolver(context));
  });
  return normalizeMultiline(output);
}

export function renderCommunicationFooterText(
  template: string | null | undefined,
  context: CommunicationFooterRenderContext
) {
  return replaceTextTokens(template ?? "", context);
}

function renderCommunicationFooterHtmlInternal(
  template: string | null | undefined,
  context: CommunicationFooterRenderContext,
  options?: CommunicationFooterHtmlOptions
) {
  const rawTemplate = normalizeMultiline(template ?? "");
  if (!rawTemplate) {
    return "";
  }

  const logoSrc = normalizeValue(options?.logoSrc ?? context.company.logoUrl);
  const lines = rawTemplate.split("\n");
  let logoRendered = false;
  const renderedLines = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return '<div style="height:8px;"></div>';
      }

      if (trimmed === "{{company.logo}}") {
        if (logoRendered) {
          return "";
        }
        logoRendered = true;
        return logoSrc
          ? `<div style="margin:0 0 10px 0;"><img src="${escapeHtml(
              logoSrc
            )}" alt="" style="display:block; max-width:180px; max-height:72px; width:auto; height:auto;" /></div>`
          : "";
      }

      const withTextTokens = replaceTextTokens(line, context);
      if (!withTextTokens) {
        return "";
      }
      return `<div style="margin:0 0 4px 0;">${escapeHtml(withTextTokens)}</div>`;
    })
    .filter(Boolean);

  return renderedLines.join("");
}

export function renderCommunicationFooterPreviewHtml(
  template: string | null | undefined,
  context: CommunicationFooterRenderContext
) {
  return renderCommunicationFooterHtmlInternal(template, context, {
    logoSrc: context.company.logoUrl,
  });
}

export function renderCommunicationFooterHtml(
  template: string | null | undefined,
  context: CommunicationFooterRenderContext,
  options?: CommunicationFooterHtmlOptions
) {
  return renderCommunicationFooterHtmlInternal(template, context, options);
}

export function appendCommunicationFooter(body: string, renderedFooter: string) {
  const normalizedBody = normalizeMultiline(body ?? "");
  const normalizedFooter = normalizeMultiline(renderedFooter ?? "");

  if (!normalizedFooter) {
    return normalizedBody;
  }

  if (!normalizedBody) {
    return normalizedFooter;
  }

  if (normalizedBody.endsWith(normalizedFooter)) {
    return normalizedBody;
  }

  return `${normalizedBody}\n\n${normalizedFooter}`.trim();
}

export function stripAppendedFooter(body: string, renderedFooter: string) {
  const normalizedBody = normalizeMultiline(body ?? "");
  const normalizedFooter = normalizeMultiline(renderedFooter ?? "");

  if (!normalizedBody || !normalizedFooter) {
    return normalizedBody;
  }

  const suffix = `\n\n${normalizedFooter}`;
  if (normalizedBody.endsWith(suffix)) {
    return normalizedBody.slice(0, -suffix.length).trimEnd();
  }
  if (normalizedBody.endsWith(normalizedFooter)) {
    return normalizedBody.slice(0, -normalizedFooter.length).trimEnd();
  }
  return normalizedBody;
}
