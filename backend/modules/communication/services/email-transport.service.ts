import nodemailer from "nodemailer";

type SmtpDiagnostics = {
  configured: boolean;
  transportReady: boolean;
  missingFields: string[];
  invalidFields: string[];
  configSummary: {
    host: string | null;
    port: number | null;
    secure: boolean;
    user: string | null;
    hasPassword: boolean;
  };
};

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedConfigKey: string | null = null;
let lastDiagnosticsLogKey: string | null = null;

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function readSmtpEnv() {
  const host = process.env.AINTEL_SMTP_HOST?.trim() || "";
  const rawPort = process.env.AINTEL_SMTP_PORT?.trim() || "";
  const parsedPort = rawPort ? Number(rawPort) : 587;
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : null;
  const secure = parseBoolean(process.env.AINTEL_SMTP_SECURE, port === 465);
  const user = process.env.AINTEL_SMTP_USER?.trim() || "";
  const pass = process.env.AINTEL_SMTP_PASS ?? "";

  const missingFields: string[] = [];
  const invalidFields: string[] = [];

  if (!host) missingFields.push("AINTEL_SMTP_HOST");
  if (!user) missingFields.push("AINTEL_SMTP_USER");
  if (!pass) missingFields.push("AINTEL_SMTP_PASS");
  if (!port) invalidFields.push("AINTEL_SMTP_PORT");

  const configured = missingFields.length === 0 && invalidFields.length === 0;

  return {
    host,
    port,
    secure,
    user,
    pass,
    configured,
    missingFields,
    invalidFields,
  };
}

export function getSmtpDiagnostics(): SmtpDiagnostics {
  const env = readSmtpEnv();
  const transportReady = Boolean(env.configured);

  return {
    configured: env.configured,
    transportReady,
    missingFields: env.missingFields,
    invalidFields: env.invalidFields,
    configSummary: {
      host: env.host || null,
      port: env.port,
      secure: env.secure,
      user: env.user || null,
      hasPassword: Boolean(env.pass),
    },
  };
}

function buildDiagnosticsLogKey(diagnostics: SmtpDiagnostics) {
  return JSON.stringify({
    configured: diagnostics.configured,
    transportReady: diagnostics.transportReady,
    missingFields: diagnostics.missingFields,
    invalidFields: diagnostics.invalidFields,
    host: diagnostics.configSummary.host,
    port: diagnostics.configSummary.port,
    secure: diagnostics.configSummary.secure,
    user: diagnostics.configSummary.user,
    hasPassword: diagnostics.configSummary.hasPassword,
  });
}

export function logSmtpDiagnostics(context: string) {
  const diagnostics = getSmtpDiagnostics();
  const key = `${context}:${buildDiagnosticsLogKey(diagnostics)}`;
  if (lastDiagnosticsLogKey === key) {
    return diagnostics;
  }
  lastDiagnosticsLogKey = key;

  console.info("[communication][smtp]", {
    context,
    configured: diagnostics.configured,
    transportReady: diagnostics.transportReady,
    missingFields: diagnostics.missingFields,
    invalidFields: diagnostics.invalidFields,
    host: diagnostics.configSummary.host,
    port: diagnostics.configSummary.port,
    secure: diagnostics.configSummary.secure,
    user: diagnostics.configSummary.user,
    hasPassword: diagnostics.configSummary.hasPassword,
  });

  return diagnostics;
}

function buildConfigErrorMessage(diagnostics: SmtpDiagnostics) {
  const parts: string[] = [];
  if (diagnostics.missingFields.length > 0) {
    parts.push(`Manjkajo: ${diagnostics.missingFields.join(", ")}`);
  }
  if (diagnostics.invalidFields.length > 0) {
    parts.push(`Neveljavno: ${diagnostics.invalidFields.join(", ")}`);
  }
  if (parts.length === 0) {
    return "SMTP ni konfiguriran.";
  }
  return `SMTP ni konfiguriran. ${parts.join(". ")}`;
}

export function getEmailTransporter() {
  const env = readSmtpEnv();
  const configKey = JSON.stringify({
    host: env.host,
    port: env.port,
    secure: env.secure,
    user: env.user,
    hasPassword: Boolean(env.pass),
  });

  if (!env.configured || !env.port) {
    const diagnostics = logSmtpDiagnostics("getEmailTransporter");
    throw new Error(buildConfigErrorMessage(diagnostics));
  }

  if (cachedTransporter && cachedConfigKey === configKey) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: {
      user: env.user,
      pass: env.pass,
    },
  });
  cachedConfigKey = configKey;

  return cachedTransporter;
}

export async function sendEmail(input: nodemailer.SendMailOptions) {
  const transporter = getEmailTransporter();
  return transporter.sendMail(input);
}
