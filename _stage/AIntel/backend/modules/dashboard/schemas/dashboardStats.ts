export interface DashboardStats {
  users: number;
  projects: number;
  activeWidgets: number;
}

export function getDefaultDashboardStats(): DashboardStats {
  return {
    users: 0,
    projects: 0,
    activeWidgets: 1
  };
}
