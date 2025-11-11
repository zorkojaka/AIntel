export interface TimelineEvent {
  phase: string;
  status: 'pending' | 'completed';
  documentId?: string;
  createdAt?: string;
}

export interface DocumentReferences {
  offerId?: string;
  orderId?: string;
  workOrderId?: string;
  deliveryNoteId?: string;
  invoiceId?: string;
}

export interface ProjectRecord {
  _id: string;
  project_id: number;
  name: string;
  description?: string;
  city?: string;
  startDate?: string;
  endDate?: string;
  status: 'draft' | 'confirmed' | 'scheduled' | 'executed' | 'completed';
  companyName?: string;
  contactName?: string;
  timeline: TimelineEvent[];
  documents?: DocumentReferences;
}
