export type ProjectStatus =
  | 'draft'
  | 'offered'
  | 'ordered'
  | 'in-progress'
  | 'delivered'
  | 'completed'
  | 'invoiced';

export interface Project {
  id: string;
  title: string;
  customer: string;
  status: ProjectStatus;
  offerAmount: number;
  invoiceAmount: number;
  createdAt: string;
}

export interface ProjectCustomer {
  name: string;
  taxId: string;
  address: string;
  paymentTerms: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
  vatRate: number;
  total: number;
  description?: string;
  category?: string;
}

export interface ProjectOffer {
  id: string;
  version: number;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';
  amount: number;
  date: string;
  isSelected?: boolean;
}

export interface ProjectWorkOrder {
  id: string;
  team: string;
  schedule: string;
  location: string;
  status: 'planned' | 'in-progress' | 'completed' | 'cancelled';
  notes?: string;
}

export interface ProjectTimelineEvent {
  id: string;
  type: 'offer' | 'po' | 'delivery' | 'execution' | 'invoice' | 'status-change' | 'edit';
  title: string;
  description?: string;
  timestamp: string;
  user?: string;
  metadata?: Record<string, string>;
}

export interface ProjectDetail extends Project {
  city: string;
  requirements: string;
  customerInfo: ProjectCustomer;
  items: ProjectItem[];
  offers: ProjectOffer[];
  workOrders: ProjectWorkOrder[];
  timeline: ProjectTimelineEvent[];
}
