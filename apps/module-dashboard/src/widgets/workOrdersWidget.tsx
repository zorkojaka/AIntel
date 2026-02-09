import { Button } from '@aintel/ui';
import type { DashboardWidgetDefinition, InstallerDashboardWidgetProps } from '../types';
import { formatDate, navigateToProject, renderEmptyState, renderError, showMetaParts } from './utils';

export const workOrdersWidget: DashboardWidgetDefinition = {
  id: 'work-orders',
  title: 'Moji delovni nalogi',
  description: 'Pregled delovnih nalogov z mojih projektov.',
  roles: ['installer'],
  defaultEnabledForRoles: ['installer'],
  size: 'md',
  render: ({ data, isLoading, error }: InstallerDashboardWidgetProps) => {
    if (isLoading) {
      return renderEmptyState('Nalagam delovne naloge...');
    }
    if (error) {
      return renderError(error);
    }
    if (!data.myWorkOrders.length) {
      return renderEmptyState('Ni delovnih nalogov.');
    }

    return (
      <>
        <ul className="dashboard-widget__list">
          {data.myWorkOrders.slice(0, 10).map((order) => (
            <li key={order.id} className="dashboard-widget__item">
              <div>
                <div className="dashboard-widget__title">{order.projectCode}</div>
                <div className="dashboard-widget__meta">
                  {showMetaParts([
                    order.scheduledAt ? `Termin: ${formatDate(order.scheduledAt)}` : 'Termin ni dolocen',
                    `Status: ${order.status}`,
                  ])}
                </div>
                <div className="dashboard-widget__meta">
                  {showMetaParts([`Postavke: ${order.itemCount}`, `Ustvarjeno: ${formatDate(order.createdAt)}`])}
                </div>
              </div>
              <Button variant="ghost" onClick={() => navigateToProject(order.projectId, 'execution')}>
                Odpri delovni nalog
              </Button>
            </li>
          ))}
        </ul>
        <div className="dashboard-widget__footer">
          <Button variant="ghost" onClick={() => window.location.assign('/projects')}>
            Pokaži vse
          </Button>
        </div>
      </>
    );
  },
};
