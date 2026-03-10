import type { DashboardWidgetDefinition, InstallerDashboardWidgetProps } from '../types';
import { renderEmptyState } from './utils';
import { WeekScheduler } from './WeekScheduler';

export const agendaWeekWidget: DashboardWidgetDefinition = {
  id: 'agenda-week',
  title: 'Urnik (1 teden)',
  description: 'Fiksni tedenski pregled delovnih nalogov.',
  roles: ['installer'],
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
    return <WeekScheduler workOrders={data.myWorkOrders} variant="week" />;
  },
};
