export type DashboardWidgetId = 'upcoming-projects' | 'material-orders' | 'work-orders';

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
  status: string;
  itemCount: number;
  createdAt: string;
}

export interface InstallerDashboardResponse {
  upcomingConfirmedProjects: UpcomingProjectSummary[];
  myMaterialOrders: MaterialOrderSummary[];
  myWorkOrders: WorkOrderSummary[];
}
