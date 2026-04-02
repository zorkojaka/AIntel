import type {
  CommunicationCategory,
  CommunicationEvent,
  CommunicationMessage,
  CommunicationSenderSettings,
  CommunicationTemplate,
} from '@aintel/shared/types/communication';

async function parseEnvelope<T>(response: Response): Promise<T> {
  const rawText = await response.text();
  let payload: any = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new Error(response.ok ? 'Neveljaven odgovor streznika.' : rawText || 'Napaka pri komunikaciji s streznikom.');
  }

  if (!response.ok) {
    throw {
      message: payload?.message ?? payload?.error ?? rawText ?? 'Napaka pri komunikaciji s streznikom.',
      code: payload?.code,
    };
  }

  if (!payload?.success) {
    throw {
      message: payload?.message ?? payload?.error ?? 'Napaka pri komunikaciji s streznikom.',
      code: payload?.code,
    };
  }

  return payload.data as T;
}

export async function fetchCommunicationFeed(projectId: string, limit = 12) {
  const response = await fetch(`/api/projects/${projectId}/communication/feed?limit=${limit}`);
  return parseEnvelope<CommunicationEvent[]>(response);
}

export async function fetchOfferMessages(projectId: string, offerId: string) {
  const response = await fetch(`/api/projects/${projectId}/offers/${offerId}/messages`);
  return parseEnvelope<CommunicationMessage[]>(response);
}

export async function fetchCommunicationMessage(projectId: string, messageId: string) {
  const response = await fetch(`/api/projects/${projectId}/messages/${messageId}`);
  return parseEnvelope<CommunicationMessage>(response);
}

export async function fetchCommunicationTemplates(category: CommunicationCategory) {
  const response = await fetch(`/api/settings/communication/templates?category=${category}`);
  return parseEnvelope<CommunicationTemplate[]>(response);
}

export async function fetchCommunicationSenderSettings() {
  const response = await fetch('/api/settings/communication');
  return parseEnvelope<CommunicationSenderSettings>(response);
}

export async function sendOfferCommunicationEmail(
  projectId: string,
  offerId: string,
  payload: {
    to: string;
    cc?: string;
    bcc?: string;
    templateId?: string | null;
    templateKey?: string | null;
    subject: string;
    body: string;
    selectedAttachments: Array<'offer_pdf' | 'project_pdf'>;
  }
) {
  const response = await fetch(`/api/projects/${projectId}/offers/${offerId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseEnvelope<{ message: CommunicationMessage }>(response);
}

export async function sendWorkOrderConfirmationCommunicationEmail(
  projectId: string,
  workOrderId: string,
  payload: {
    to: string;
    cc?: string;
    bcc?: string;
    templateId?: string | null;
    templateKey?: string | null;
    subject: string;
    body: string;
    selectedAttachments: Array<"work_order_confirmation_pdf">;
  }
) {
  const response = await fetch(`/api/projects/${projectId}/work-orders/${workOrderId}/send-confirmation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseEnvelope<{ message: CommunicationMessage }>(response);
}
