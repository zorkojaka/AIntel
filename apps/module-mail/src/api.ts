import { parseApiEnvelope } from '@aintel/shared/utils/api-client';

export type EmailStatus = 'new' | 'matched' | 'unmatched' | 'ignored';

export interface EmailMessage {
  _id: string;
  messageId?: string;
  fromAddress: string;
  fromName?: string;
  to: string[];
  subject: string;
  date: string;
  text: string;
  attachmentsMeta: Array<{ filename: string; size: number; contentType: string }>;
  match?: {
    projectId?: string;
    clientId?: string;
    offerId?: string;
    matchedBy?: 'reply' | 'client-email' | 'document-number' | 'manual';
  };
  status: EmailStatus;
}

export interface EmailListResponse {
  messages: EmailMessage[];
  ingest: {
    configured: boolean;
    host: string | null;
    user: string | null;
    lastRunAt: string | null;
    lastError: string | null;
  };
}

export async function fetchEmailMessages(params: { status?: string; q?: string; projectId?: string } = {}): Promise<EmailListResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.q) query.set('q', params.q);
  if (params.projectId) query.set('projectId', params.projectId);
  const response = await fetch(`/api/email/messages${query.size ? `?${query}` : ''}`);
  return parseApiEnvelope<EmailListResponse>(response, 'Pošte ni mogoče naložiti.');
}

export async function linkEmailToProject(emailId: string, projectId: string): Promise<EmailMessage> {
  const response = await fetch(`/api/email/messages/${encodeURIComponent(emailId)}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  return parseApiEnvelope<EmailMessage>(response, 'Povezava ni uspela.');
}

export async function ignoreEmail(emailId: string): Promise<EmailMessage> {
  const response = await fetch(`/api/email/messages/${encodeURIComponent(emailId)}/ignore`, { method: 'POST' });
  return parseApiEnvelope<EmailMessage>(response, 'Sporočila ni mogoče označiti.');
}

export async function runEmailIngest(): Promise<{ stored?: number; matched?: number; skipped?: number }> {
  const response = await fetch('/api/email/ingest/run', { method: 'POST' });
  return parseApiEnvelope(response, 'Branje nabiralnika ni uspelo.');
}
