export type ProjectStatus =
  | 'draft'
  | 'offered'
  | 'ordered'
  | 'in-progress'
  | 'delivered'
  | 'completed'
  | 'invoiced';

export type TimelineEventType =
  | 'offer'
  | 'po'
  | 'delivery'
  | 'execution'
  | 'invoice'
  | 'status-change'
  | 'edit';

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
  type: TimelineEventType;
  title: string;
  description?: string;
  timestamp: string;
  user?: string;
  metadata?: Record<string, string>;
}

export interface ProjectSummary {
  id: string;
  title: string;
  customer: string;
  status: ProjectStatus;
  offerAmount: number;
  invoiceAmount: number;
  createdAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  city: string;
  requirements: string;
  customerInfo: ProjectCustomer;
  items: ProjectItem[];
  offers: ProjectOffer[];
  workOrders: ProjectWorkOrder[];
  timeline: ProjectTimelineEvent[];
}

let counter = 7;

function generateId(): string {
  counter += 1;
  return `PRJ-${counter.toString().padStart(3, '0')}`;
}

function timelineId(): string {
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

const iso = (date: string) => date;

export const projectsStore: ProjectDetail[] = [
  {
    id: 'PRJ-001',
    title: 'Hotel Dolenjc – kamere',
    customer: 'Hotel Dolenjc d.o.o.',
    status: 'offered',
    offerAmount: 2120,
    invoiceAmount: 0,
    createdAt: iso('2024-11-08'),
    city: 'Ljubljana',
    requirements: 'Postavitev 4 IP kamer DVC za nadzor vhoda in parkirišča. Integracija z obstoječim NVR.',
    customerInfo: {
      name: 'Hotel Dolenjc d.o.o.',
      taxId: 'SI12345678',
      address: 'Tržaška cesta 12, 1000 Ljubljana',
      paymentTerms: '30 dni',
    },
    items: [
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
    ],
    offers: [
      {
        id: 'offer-1',
        version: 1,
        status: 'sent',
        amount: 1950,
        date: '2024-11-08',
      },
      {
        id: 'offer-2',
        version: 2,
        status: 'accepted',
        amount: 2120,
        date: '2024-11-09',
        isSelected: true,
      },
    ],
    workOrders: [
      {
        id: 'wo-1',
        team: 'Ekipa A - Janez Novak, Marko Horvat',
        schedule: '2024-11-14 08:00',
        location: 'Hotel Dolenjc, Tržaška cesta 12, Ljubljana',
        status: 'planned',
        notes: 'Pripraviti ključe za dostop do tehničnih prostorov',
      },
    ],
    timeline: [
      {
        id: timelineId(),
        type: 'execution',
        title: 'Delovni nalog ustvarjen',
        description: 'Načrtovana montaža za 14.11.2024',
        timestamp: '2024-11-10 09:00',
        user: 'Admin',
        metadata: { team: 'Ekipa A' },
      },
      {
        id: timelineId(),
        type: 'status-change',
        title: 'Status spremenjen',
        description: "Projekt prešel v fazo 'Ponujeno'",
        timestamp: '2024-11-09 14:25',
        user: 'Admin',
      },
      {
        id: timelineId(),
        type: 'offer',
        title: 'Ponudba v2 ustvarjena',
        description: 'Posodobljena verzija ponudbe z dodanimi postavkami',
        timestamp: '2024-11-09 14:20',
        user: 'Admin',
        metadata: { amount: '€ 2.120', status: 'accepted' },
      },
      {
        id: timelineId(),
        type: 'offer',
        title: 'Ponudba v1 ustvarjena',
        description: 'Prva verzija ponudbe pripravljena',
        timestamp: '2024-11-08 10:30',
        user: 'Admin',
        metadata: { amount: '€ 1.950', status: 'sent' },
      },
      {
        id: timelineId(),
        type: 'edit',
        title: 'Projekt ustvarjen',
        description: 'Nov projekt za Hotel Dolenjc',
        timestamp: '2024-11-08 09:15',
        user: 'Admin',
      },
    ],
  },
  {
    id: 'PRJ-002',
    title: 'Poslovni center – požarni alarm',
    customer: 'ABC Nepremičnine',
    status: 'in-progress',
    offerAmount: 8450,
    invoiceAmount: 4225,
    createdAt: iso('2024-10-22'),
    city: 'Kranj',
    requirements: 'Implementacija certificiranega požarnega alarma z dvosmerno komunikacijo.',
    customerInfo: {
      name: 'ABC Nepremičnine',
      taxId: 'SI87654321',
      address: 'Primorska cesta 4, 4000 Kranj',
      paymentTerms: '30 dni',
    },
    items: [
      {
        id: 'item-5',
        name: 'Kontrolna centrala',
        sku: 'FIRE-CTRL',
        unit: 'kos',
        quantity: 1,
        price: 2600,
        discount: 0,
        vatRate: 22,
        total: 3172,
        category: 'material',
      },
      {
        id: 'item-6',
        name: 'Senzor dima',
        sku: 'SMOKE-01',
        unit: 'kos',
        quantity: 18,
        price: 80,
        discount: 0,
        vatRate: 22,
        total: 1763.2,
        category: 'material',
      },
      {
        id: 'item-7',
        name: 'Montaža sistemov',
        sku: 'LAB-005',
        unit: 'h',
        quantity: 24,
        price: 45,
        discount: 0,
        vatRate: 22,
        total: 1317.6,
        category: 'labor',
      },
    ],
    offers: [
      {
        id: 'offer-3',
        version: 1,
        status: 'accepted',
        amount: 8450,
        date: '2024-10-22',
        isSelected: true,
      },
    ],
    workOrders: [
      {
        id: 'wo-2',
        team: 'Ekipa B - Ana Kovač, Peter Vidmar',
        schedule: '2024-11-01 07:30',
        location: 'Poslovni center, Kranj',
        status: 'in-progress',
      },
    ],
    timeline: [
      {
        id: timelineId(),
        type: 'delivery',
        title: 'Dobavnica potrjena',
        description: 'Vsa oprema dostavljena',
        timestamp: '2024-10-30 08:00',
        user: 'Ana',
      },
      {
        id: timelineId(),
        type: 'status-change',
        title: 'Status spremenjen',
        description: "Projekt prešel v fazo 'V teku'",
        timestamp: '2024-10-28 15:30',
        user: 'Ana',
      },
      {
        id: timelineId(),
        type: 'offer',
        title: 'Ponudba potrjena',
        timestamp: '2024-10-23 09:00',
        user: 'Ana',
      },
    ],
  },
  {
    id: 'PRJ-003',
    title: 'Trgovina – LED razsvetljava',
    customer: 'Mega Market',
    status: 'completed',
    offerAmount: 3200,
    invoiceAmount: 3200,
    createdAt: iso('2024-09-15'),
    city: 'Novo mesto',
    requirements: 'Zamenjava obstoječe razsvetljave s 50 LED paneli in pametnim krmiljenjem.',
    customerInfo: {
      name: 'Mega Market',
      taxId: 'SI99887766',
      address: 'Glavna cesta 20, 8000 Novo mesto',
      paymentTerms: '14 dni',
    },
    items: [
      {
        id: 'item-8',
        name: 'LED panel 60x60',
        sku: 'LED-60',
        unit: 'kos',
        quantity: 50,
        price: 35,
        discount: 5,
        vatRate: 22,
        total: 1785,
        category: 'material',
      },
      {
        id: 'item-9',
        name: 'Pametna ura krmiljenja',
        sku: 'CTRL-LED',
        unit: 'kos',
        quantity: 2,
        price: 250,
        discount: 0,
        vatRate: 22,
        total: 610,
        category: 'material',
      },
      {
        id: 'item-10',
        name: 'Montaža razsvetljave',
        sku: 'LAB-LED',
        unit: 'h',
        quantity: 30,
        price: 35,
        discount: 0,
        vatRate: 22,
        total: 1281,
        category: 'labor',
      },
    ],
    offers: [
      {
        id: 'offer-4',
        version: 1,
        status: 'accepted',
        amount: 3200,
        date: '2024-09-16',
        isSelected: true,
      },
    ],
    workOrders: [
      {
        id: 'wo-3',
        team: 'Ekipa C - Borut Remškar, Sara Jug',
        schedule: '2024-09-20 08:00',
        location: 'Mega Market, Novo mesto',
        status: 'completed',
      },
    ],
    timeline: [
      {
        id: timelineId(),
        type: 'invoice',
        title: 'Račun izdan',
        timestamp: '2024-09-28 12:00',
        user: 'Admin',
        metadata: { amount: '€ 3.200' },
      },
      {
        id: timelineId(),
        type: 'execution',
        title: 'Zaključno potrdilo',
        timestamp: '2024-09-25 16:00',
        user: 'Sara Jug',
      },
    ],
  },
];

export function nextProjectId(): string {
  return generateId();
}

export function summarizeProject(project: ProjectDetail): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    customer: project.customer,
    status: project.status,
    offerAmount: project.offerAmount,
    invoiceAmount: project.invoiceAmount,
    createdAt: project.createdAt,
  };
}

export function addTimelineEntry(
  project: ProjectDetail,
  event: Omit<ProjectTimelineEvent, 'id' | 'timestamp'> & { timestamp?: string }
) {
  const entry: ProjectTimelineEvent = {
    ...event,
    id: timelineId(),
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
  project.timeline = [entry, ...project.timeline];
  return entry;
}
