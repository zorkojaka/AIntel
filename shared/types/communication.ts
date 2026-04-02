export type CommunicationChannel = "email";

export type CommunicationDirection = "outbound" | "inbound";

export type CommunicationCategory = "offer_send" | "work_order_confirmation_send";

export type CommunicationAttachmentType = "offer_pdf" | "project_pdf" | "work_order_confirmation_pdf";

export type CommunicationMessageStatus = "sent" | "failed";

export type CommunicationEventType =
  | "email_sent"
  | "email_failed"
  | "offer_confirmed"
  | "signature_completed"
  | "system_note";

export interface CommunicationSenderSettings {
  senderName: string;
  senderEmail: string;
  senderPhone?: string | null;
  senderRole?: string | null;
  defaultCc?: string | null;
  defaultBcc?: string | null;
  replyToEmail?: string | null;
  emailFooterTemplate?: string | null;
  enabled: boolean;
}

export interface CommunicationTemplate {
  id: string;
  key: string;
  name: string;
  category: CommunicationCategory;
  subjectTemplate: string;
  bodyTemplate: string;
  defaultAttachments: CommunicationAttachmentType[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationAttachmentRecord {
  type: CommunicationAttachmentType;
  refId: string;
  filename: string;
}

export interface CommunicationMessage {
  id: string;
  projectId: string;
  offerId?: string | null;
  customerId?: string | null;
  direction: CommunicationDirection;
  channel: CommunicationChannel;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subjectFinal: string;
  bodyFinal: string;
  templateId?: string | null;
  templateKey?: string | null;
  selectedAttachments: CommunicationAttachmentRecord[];
  status: CommunicationMessageStatus;
  sentAt?: string | null;
  sentByUserId?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationEvent {
  id: string;
  projectId: string;
  offerId?: string | null;
  messageId?: string | null;
  type: CommunicationEventType;
  title: string;
  description: string;
  timestamp: string;
  user?: string | null;
  metadata?: Record<string, string>;
}
