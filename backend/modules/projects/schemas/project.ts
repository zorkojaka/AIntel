export type ProjectStatus = 'draft' | 'offered' | 'ordered' | 'in-progress' | 'completed' | 'invoiced';

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
  category?: 'material' | 'labor' | 'other';
}

export interface OfferVersion {
  id: string;
  version: number;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';
  amount: number;
  date: string;
  isSelected?: boolean;
}

export interface WorkOrder {
  id: string;
  team: string;
  schedule: string;
  location: string;
  status: 'planned' | 'in-progress' | 'completed';
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  supplier: string;
  status: 'draft' | 'sent' | 'confirmed' | 'delivered';
  amount: number;
  dueDate: string;
  items: string[];
}

export interface DeliveryNote {
  id: string;
  poId: string;
  supplier: string;
  receivedQuantity: number;
  totalQuantity: number;
  receivedDate: string;
  serials?: string[];
}

export interface TimelineEvent {
  id: string;
  type: 'edit' | 'offer' | 'status-change' | 'po' | 'delivery' | 'execution' | 'signature';
  title: string;
  description: string;
  timestamp: string;
  user: string;
  metadata?: Record<string, string>;
}

export interface ProjectCustomer {
  name: string;
  taxId?: string;
  address?: string;
  paymentTerms?: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  category: 'offer' | 'invoice' | 'work-order';
  content: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  title: string;
  customer: ProjectCustomer;
  status: ProjectStatus;
  offerAmount: number;
  invoiceAmount: number;
  createdAt: string;
  requirements: string;
  items: ProjectItem[];
  offers: OfferVersion[];
  workOrders: WorkOrder[];
  purchaseOrders: PurchaseOrder[];
  deliveryNotes: DeliveryNote[];
  timeline: TimelineEvent[];
  templates: ProjectTemplate[];
}

const defaultTemplates: ProjectTemplate[] = [
  {
    id: 'tpl-default-offer',
    name: 'Standardna ponudba',
    description: 'Privzeta predloga za vse ponudbe',
    category: 'offer',
    content: '<html><body>Privzeta ponudba</body></html>',
    isDefault: true,
    createdAt: '2024-11-01T10:00:00',
    updatedAt: '2024-11-01T10:00:00',
  },
];

const seedItems: ProjectItem[] = [
  {
    id: 'item-1',
    name: 'DVC IP kamera 4MP',
    sku: 'DVC-4MP-001',
    unit: 'kos',
    quantity: 4,
    price: 185,
    discount: 0,
    vatRate: 22,
    total: 902.8,
    category: 'material',
    description: 'IP kamera 4MP z nočnim vidom, H.265 kodiranje',
  },
  {
    id: 'item-2',
    name: 'UTP Cat6 kabel',
    sku: 'UTP-CAT6',
    unit: 'm',
    quantity: 50,
    price: 1.2,
    discount: 5,
    vatRate: 22,
    total: 69.54,
    category: 'material',
    description: 'UTP kabel kategorije 6 za prenos podatkov',
  },
  {
    id: 'item-3',
    name: 'Montaža in konfiguracija',
    sku: 'SRV-INST',
    unit: 'h',
    quantity: 8,
    price: 45,
    discount: 0,
    vatRate: 22,
    total: 439.2,
    category: 'labor',
    description: 'Strokovnjak za montažo in konfiguracijo kamer',
  },
  {
    id: 'item-4',
    name: 'NVR 8-kanalni',
    sku: 'NVR-8CH-2TB',
    unit: 'kos',
    quantity: 1,
    price: 320,
    discount: 10,
    vatRate: 22,
    total: 351.36,
    category: 'material',
    description: 'Network Video Recorder z 2TB diskom',
  },
];

const seedOffers: OfferVersion[] = [
  { id: 'offer-1', version: 1, status: 'sent', amount: 1950, date: '08.11.2024' },
  { id: 'offer-2', version: 2, status: 'accepted', amount: 2120, date: '09.11.2024', isSelected: true },
];

const seedWorkOrders: WorkOrder[] = [
  {
    id: 'wo-1',
    team: 'Ekipa A - Janez Novak, Marko Horvat',
    schedule: '14.11.2024 08:00',
    location: 'Hotel Dolenjc, Tržaška cesta 12, Ljubljana',
    status: 'planned',
    notes: 'Pripraviti ključe za dostop do tehničnih prostorov',
  },
];

const seedTimeline: TimelineEvent[] = [
  {
    id: 'evt-1',
    type: 'edit',
    title: 'Projekt ustvarjen',
    description: 'Nov projekt za Hotel Dolenjc',
    timestamp: '08.11.2024 09:15',
    user: 'Admin',
  },
  {
    id: 'evt-2',
    type: 'offer',
    title: 'Ponudba v1 ustvarjena',
    description: 'Prva verzija ponudbe pripravljena',
    timestamp: '08.11.2024 10:30',
    user: 'Admin',
    metadata: { amount: '€ 1.950', status: 'sent' },
  },
  {
    id: 'evt-3',
    type: 'offer',
    title: 'Ponudba v2 ustvarjena',
    description: 'Posodobljena verzija ponudbe z dodanimi postavkami',
    timestamp: '09.11.2024 14:20',
    user: 'Admin',
    metadata: { amount: '€ 2.120', status: 'accepted' },
  },
  {
    id: 'evt-4',
    type: 'status-change',
    title: 'Status spremenjen',
    description: "Projekt prešel v fazo 'Ponujeno'",
    timestamp: '09.11.2024 14:25',
    user: 'Admin',
  },
  {
    id: 'evt-5',
    type: 'execution',
    title: 'Delovni nalog ustvarjen',
    description: 'Načrtovana montaža za 14.11.2024',
    timestamp: '10.11.2024 09:00',
    user: 'Admin',
    metadata: { team: 'Ekipa A' },
  },
];

export const projects: Project[] = [
  {
    id: 'PRJ-001',
    title: 'Hotel Dolenjc – kamere',
    customer: {
      name: 'Hotel Dolenjc d.o.o.',
      taxId: 'SI12345678',
      address: 'Tržaška cesta 12, 1000 Ljubljana',
      paymentTerms: '30 dni',
    },
    status: 'offered',
    offerAmount: 2120,
    invoiceAmount: 0,
    createdAt: '2024-11-08',
    requirements: 'Postavitev 4 IP kamer DVC za nadzor vhoda in parkirišča. Vodenje kablov po stenah, postavitev NVR, konfiguracija.',
    items: seedItems,
    offers: seedOffers,
    workOrders: seedWorkOrders,
    purchaseOrders: [],
    deliveryNotes: [],
    timeline: seedTimeline,
    templates: defaultTemplates,
  },
];

export function nextProjectId(): string {
  const base = 100 + projects.length;
  return `PRJ-${(base + 1).toString().padStart(3, '0')}`;
}

export function addTimeline(project: Project, event: Omit<TimelineEvent, 'id'>) {
  const newEvent: TimelineEvent = { ...event, id: `evt-${Date.now().toString(36)}` };
  project.timeline = [newEvent, ...project.timeline];
}

export function summarizeProject(project: Project) {
  return {
    id: project.id,
    title: project.title,
    customer: project.customer.name,
    status: project.status,
    offerAmount: project.offerAmount,
    invoiceAmount: project.invoiceAmount,
    createdAt: project.createdAt,
  };
}

export function calculateOfferAmount(items: ProjectItem[]) {
  return items.reduce((acc, item) => acc + item.quantity * item.price * (1 - item.discount / 100) * (1 + item.vatRate / 100), 0);
}

export function findProject(id: string) {
  return projects.find((project) => project.id === id);
}
