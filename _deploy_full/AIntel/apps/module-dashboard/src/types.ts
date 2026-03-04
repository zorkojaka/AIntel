import type { ReactNode } from 'react';

export type DashboardWidgetId =
  | 'agenda'
  | 'project-summary'
  | 'upcoming-projects'
  | 'material-orders'
  | 'work-orders';
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

export interface InstallerDashboardResponse {
  upcomingConfirmedProjects: UpcomingProjectSummary[];
  myMaterialOrders: MaterialOrderSummary[];
  myWorkOrders: WorkOrderSummary[];
}

export interface InstallerDashboardWidgetProps {
  data: InstallerDashboardResponse;
  isLoading: boolean;
  error: string | null;
  employeeId: string | null;
  userId: string | null;
}
