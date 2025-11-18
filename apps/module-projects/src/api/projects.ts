import type { Project } from '../components/ProjectList';
import type { Item } from '../components/ItemsTable';
import type { OfferVersion } from '../components/OfferVersionCard';
import type { WorkOrder } from '../components/WorkOrderCard';
import type { TimelineEvent } from '../components/TimelineFeed';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

export interface ProjectDetail extends Project {
  city: string;
  requirements: string;
  customerInfo: {
    name: string;
    taxId: string;
    address: string;
    paymentTerms: string;
  };
  items: Item[];
  offers: OfferVersion[];
  workOrders: WorkOrder[];
  timeline: TimelineEvent[];
}

export interface CreateProjectPayload {
  title: string;
  customer: {
    name: string;
    taxId?: string;
    address?: string;
    paymentTerms?: string;
  };
  city?: string;
  requirements?: string;
}

export interface ConfirmPhasePayload {
  phase: 'offer' | 'delivery' | 'completion';
  action?: 'confirm' | 'cancel';
  offerId?: string;
  note?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;
    const message = body?.error ?? `API napaka ${response.status}`;
    throw new Error(message);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  if (!payload.success) {
    throw new Error(payload.error ?? 'Neznana napaka API.');
  }

  return payload.data;
}

export function fetchProjects(): Promise<Project[]> {
  return request<Project[]>('/projects');
}

export function fetchProjectDetail(projectId: string): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/projects/${projectId}`);
}

export function createProject(payload: CreateProjectPayload): Promise<ProjectDetail> {
  return request<ProjectDetail>('/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function confirmProjectPhase(projectId: string, payload: ConfirmPhasePayload): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/projects/${projectId}/confirm-phase`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
