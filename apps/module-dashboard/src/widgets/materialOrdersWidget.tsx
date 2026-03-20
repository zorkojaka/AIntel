import { Button } from '@aintel/ui';
import type { DashboardWidgetDefinition, InstallerDashboardWidgetProps } from '../types';
import { formatDate, navigateToProject, normalizeMaterialStatusLabel, renderEmptyState, renderError } from './utils';

export const materialOrdersWidget: DashboardWidgetDefinition = {
  id: 'material-orders',
  title: 'Moja narocila za material',
  description: 'Pregled materialnih narocil na mojih projektih.',
  roles: ['installer'],
  defaultEnabledForRoles: ['installer'],
  size: 'md',
  render: ({ data, isLoading, error }: InstallerDashboardWidgetProps) => {
    if (isLoading) {
      return renderEmptyState('Nalagam narocila...');
    }
    if (error) {
      return renderError(error);
    }
    if (!data.myMaterialOrders.length) {
      return renderEmptyState('Ni materialnih narocil.');
    }

    return (
      <>
        <ul className="dashboard-widget__list">
          {data.myMaterialOrders.slice(0, 10).map((order) => (
            <li key={order.id} className="dashboard-widget__item">
              <div>
                <div className="dashboard-widget__title">{order.projectCode}</div>
                <div className="dashboard-widget__meta">{`Postavke: ${order.itemCount}`}</div>
                <div className="dashboard-widget__status">
                  {normalizeMaterialStatusLabel(order.materialStatus) ?? '—'}
                </div>
                <details className="dashboard-widget__details">
                  <summary>Podrobnosti</summary>
                  <div className="dashboard-widget__details-content">
                    <div className="dashboard-widget__meta">{`Ustvarjeno: ${formatDate(order.createdAt)}`}</div>
                  </div>
                </details>
              </div>
              <Button className="dashboard-widget__cta" variant="ghost" onClick={() => navigateToProject(order.projectId, 'logistics')}>
                Odpri logistiko
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
