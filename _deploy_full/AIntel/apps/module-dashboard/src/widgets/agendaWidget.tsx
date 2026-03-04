import type { DashboardWidgetDefinition, InstallerDashboardWidgetProps } from '../types';
import { renderEmptyState } from './utils';
import { WeekScheduler } from './WeekScheduler';

export const agendaWidget: DashboardWidgetDefinition = {
  id: 'agenda',
  title: 'Urnik (7 dni)',
  description: 'Tedenski urnik delovnih nalogov.',
  roles: ['installer'],
  defaultEnabledForRoles: ['installer'],
  size: 'lg',
  render: ({ data, isLoading, error }: InstallerDashboardWidgetProps) => {
    if (isLoading) {
      return renderEmptyState('Nalagam urnik...');
    }
    if (error) {
      return renderEmptyState('Napaka pri nalaganju urnika.');
    }

    if (!data.myWorkOrders.length) {
      return renderEmptyState('Ni dogodkov.');
    }

    return <WeekScheduler workOrders={data.myWorkOrders} />;
  },
};
