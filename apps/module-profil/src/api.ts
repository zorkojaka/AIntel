export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string | null;
}

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
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'Zahteva ni uspela.');
  }
  return payload.data;
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

export function fetchMyServiceRates() {
  return request<ServiceRate[]>('/api/profile/my-service-rates');
}
