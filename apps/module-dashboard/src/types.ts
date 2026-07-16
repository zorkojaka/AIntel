import type { ReactNode } from 'react';

export type DashboardWidgetId =
  | 'agenda'
  | 'agenda-week'
  | 'agenda-adaptive'
  | 'project-summary'
  | 'upcoming-projects'
  | 'material-orders'
  | 'work-orders'
  | 'earnings-forecast';
export type DashboardWidgetSize = 'sm' | 'md' | 'lg';

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId;
  title: string;
  description?: string;
  roles?: string[];
  defaultEnabledForRoles?: string[];
  size?: DashboardWidgetSize;
  render: (props: InstallerDashboardWidgetProps) => ReactNode;
}

export interface DashboardLayout {
  widgetIds: DashboardWidgetId[];
}

export interface UpcomingProjectSummary {
  id: string;
  code: string;
  customerName: string;
  customerAddress?: string | null;
  confirmedOfferVersionId?: string | null;
  confirmedOfferVersionLabel?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialOrderSummary {
  id: string;
  projectId: string;
  projectCode: string;
  materialStatus: string;
  itemCount: number;
  createdAt: string;
}

export interface WorkOrderSummary {
  id: string;
  projectId: string;
  projectCode: string;
  scheduledAt: string | null;
  title?: string | null;
  projectTitle?: string | null;
  projectAddress?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  materialStatus?: string | null;
  casovnaNorma: number;
  status: string;
  itemCount: number;
  createdAt: string;
}

export interface ForecastProject {
  projectId: string;
  code: string;
  title: string;
  customerName: string;
  status: string;
  acceptedAt: string | null;
  month: string | null;
  earnings: number;
  /** Med koliko dodeljenih monterjev je zaslužek razdeljen (1 = sam). */
  sharedBetween: number;
  /** Storitve brez nastavljene cene zame — zaslužek je zato podcenjen. */
  servicesWithoutRate: string[];
}

export interface ForecastMonth {
  month: string | null;
  label: string;
  earnings: number;
  projectCount: number;
}

export interface EarningsForecast {
  employeeId: string;
  totalEarnings: number;
  projects: ForecastProject[];
  months: ForecastMonth[];
}

export interface InstallerDashboardResponse {
  upcomingConfirmedProjects: UpcomingProjectSummary[];
  myMaterialOrders: MaterialOrderSummary[];
  myWorkOrders: WorkOrderSummary[];
  earningsForecast?: EarningsForecast | null;
}

export interface InstallerDashboardWidgetProps {
  data: InstallerDashboardResponse;
  isLoading: boolean;
  error: string | null;
  employeeId: string | null;
  userId: string | null;
}
