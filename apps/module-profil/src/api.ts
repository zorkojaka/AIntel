import { parseApiEnvelope } from '@aintel/shared/utils/api-client';

export interface ProfileOverview {
  name: string;
  email: string;
  role: string;
  employeeId: string | null;
  hireDate: string | null;
  kpis: {
    thisMonth: { earnings: number; projectCount: number };
    thisYear: { earnings: number; projectCount: number };
    lastWeek: { earnings: number; projectCount: number };
    allTime: { projectCount: number };
  };
  nextProject: { id: string; date: string; customer: string; address: string } | null;
}

export interface ProfileProject {
  id: string;
  title: string;
  date: string;
  customer: string;
  address: string;
  categories: string[];
  earnings: number;
  isPaid: boolean;
  paymentStatus: 'paid' | 'pending';
  status: string;
  isUpcoming: boolean;
  isCompleted: boolean;
}

export interface EarningsResponse {
  monthlyChart: Array<{ month: string; amount: number; projectCount: number }>;
  summary: {
    totalThisYear: number;
    totalPending: number;
    totalPaid: number;
  };
  table: Array<{ month: string; projectCount: number; earnings: number; isPaid: boolean }>;
}

export interface ProjectEarningItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface ProjectEarning {
  id: string;
  title: string;
  completedAt: string;
  customer: string;
  totalEarnings: number;
  isPaid: boolean;
  paymentStatus: 'paid' | 'pending';
  items: ProjectEarningItem[];
}

export interface ServiceRate {
  serviceProductId: string;
  serviceName: string;
  servicePrice: number;
  employeeEarnsAmount: number;
}

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  return parseApiEnvelope<T>(response, 'Zahteva ni uspela.');
}

export function fetchProfileOverview() {
  return request<ProfileOverview>('/api/profile/me');
}

export function fetchMyProjects(filter: 'all' | 'upcoming' | 'completed') {
  return request<ProfileProject[]>(`/api/profile/my-projects?filter=${filter}`);
}

export function fetchMyEarnings(year: number) {
  return request<EarningsResponse>(`/api/profile/my-earnings?year=${year}`);
}

export function fetchMyProjectEarnings() {
  return request<ProjectEarning[]>('/api/profile/my-project-earnings');
}

export function fetchMyServiceRates() {
  return request<ServiceRate[]>('/api/profile/my-service-rates');
}
