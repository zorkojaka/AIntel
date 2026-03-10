import type { DashboardWidgetDefinition, InstallerDashboardWidgetProps } from '../types';
import { renderEmptyState } from './utils';
import { WeekScheduler } from './WeekScheduler';

export const agendaAdaptiveWidget: DashboardWidgetDefinition = {
  id: 'agenda-adaptive',
  title: 'Urnik (adaptive/mobile)',
  description: 'Dinamicni prikaz urnika, optimiziran za mobilno uporabo.',
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
    return <WeekScheduler workOrders={data.myWorkOrders} variant="adaptive" />;
  },
};
