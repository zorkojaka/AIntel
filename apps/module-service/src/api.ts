import { parseApiEnvelope } from '@aintel/shared/utils/api-client';

// AIN-P2-08 rez 4: frontend module-service — bere/piše /api/service (ServiceTicket +
// MaintenancePlan). Ovojnica {success,data,error} prek parseApiEnvelope.

export type ServiceTicketStatus = 'reported' | 'scheduled' | 'resolved' | 'cancelled';
export type ServiceTicketSource = 'portal' | 'phone' | 'email' | 'internal';
export type ServiceTicketPriority = 'low' | 'normal' | 'high';

export interface ServiceTicket {
  _id: string;
  status: ServiceTicketStatus;
  source: ServiceTicketSource;
  priority: ServiceTicketPriority;
  subject: string;
  description?: string;
  client?: { id?: string; name?: string };
  projectId?: string | null;
  contact?: { name?: string; email?: string; phone?: string };
  scheduledAt?: string | null;
  resolvedAt?: string | null;
  resolution?: { outcome?: string; note?: string };
  createdAt: string;
}

export type MaintenancePlanStatus = 'active' | 'paused' | 'ended';

export interface MaintenancePlanEquipment {
  name: string;
  quantity: number;
}

export interface MaintenancePlan {
  _id: string;
  status: MaintenancePlanStatus;
  client?: { id?: string; name?: string; email?: string };
  projectId?: string | null;
  equipment: MaintenancePlanEquipment[];
  intervalMonths: number;
  installedAt?: string | null;
  warrantyUntil?: string | null;
  nextDueAt: string;
  lastVisitAt?: string | null;
  upsellChecklist: string[];
  createdAt: string;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

// ── Service tickets ────────────────────────────────────────────────────────

export async function fetchServiceTickets(params: { status?: string } = {}): Promise<ServiceTicket[]> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  const response = await fetch(`/api/service/tickets${query.size ? `?${query}` : ''}`);
  return parseApiEnvelope<ServiceTicket[]>(response, 'Servisnih zahtevkov ni mogoče naložiti.');
}

export async function createServiceTicket(input: {
  subject: string;
  description?: string;
  priority?: ServiceTicketPriority;
  source?: ServiceTicketSource;
  clientName?: string;
  contact?: { name?: string; email?: string; phone?: string };
}): Promise<ServiceTicket> {
  const response = await fetch('/api/service/tickets', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ ...input, client: input.clientName ? { name: input.clientName } : undefined }),
  });
  return parseApiEnvelope<ServiceTicket>(response, 'Zahtevka ni mogoče ustvariti.');
}

export async function updateServiceTicket(
  id: string,
  patch: { status?: ServiceTicketStatus; priority?: ServiceTicketPriority; note?: string; resolution?: { outcome?: string; note?: string } },
): Promise<ServiceTicket> {
  const response = await fetch(`/api/service/tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(patch),
  });
  return parseApiEnvelope<ServiceTicket>(response, 'Zahtevka ni mogoče posodobiti.');
}

// ── Maintenance plans ──────────────────────────────────────────────────────

export async function fetchMaintenancePlans(params: { status?: string } = {}): Promise<MaintenancePlan[]> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  const response = await fetch(`/api/service/maintenance-plans${query.size ? `?${query}` : ''}`);
  return parseApiEnvelope<MaintenancePlan[]>(response, 'Načrtov vzdrževanja ni mogoče naložiti.');
}

export async function createPlanFromProject(projectId: string): Promise<MaintenancePlan> {
  const response = await fetch('/api/service/maintenance-plans/from-project', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ projectId }),
  });
  return parseApiEnvelope<MaintenancePlan>(response, 'Načrta iz projekta ni mogoče izpeljati.');
}

export async function updateMaintenancePlan(
  id: string,
  patch: { status?: MaintenancePlanStatus; recordVisit?: boolean; nextDueAt?: string; intervalMonths?: number; note?: string },
): Promise<MaintenancePlan> {
  const response = await fetch(`/api/service/maintenance-plans/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(patch),
  });
  return parseApiEnvelope<MaintenancePlan>(response, 'Načrta ni mogoče posodobiti.');
}
