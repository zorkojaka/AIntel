import { useEffect, useState } from 'react';
import { parseApiEnvelope } from '@aintel/shared/utils/api-client';
import type { DashboardWidgetDefinition, WorkOrderSummary } from '../types';
import { renderEmptyState } from './utils';
import { WeekScheduler } from './WeekScheduler';

// Urnik podjetja (admin/organizator): VSI razpisani delovni nalogi, ne samo
// lastni. Vsak dogodek pokaže še ekipo, ki je na nalogu.

function CompanyAgenda() {
  const [workOrders, setWorkOrders] = useState<WorkOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/dashboard/company', { credentials: 'include' });
        const payload = await parseApiEnvelope<{ workOrders: WorkOrderSummary[] }>(
          response,
          'Urnika podjetja ni bilo mogoče naložiti.',
        );
        if (!active) return;
        setWorkOrders(payload.workOrders ?? []);
        setError(null);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Napaka pri nalaganju.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return renderEmptyState('Nalagam urnik podjetja...');
  if (error) return renderEmptyState(error);
  if (!workOrders.length) return renderEmptyState('Ni razpisanih terminov.');
  return <WeekScheduler workOrders={workOrders} variant="standard" />;
}

export const companyAgendaWidget: DashboardWidgetDefinition = {
  id: 'company-agenda',
  title: 'Urnik podjetja',
  description: 'Vsi razpisani termini vseh ekip — ne samo lastni.',
  roles: ['admin', 'organizer'],
  defaultEnabledForRoles: ['admin', 'organizer'],
  size: 'lg',
  render: () => <CompanyAgenda />,
};
