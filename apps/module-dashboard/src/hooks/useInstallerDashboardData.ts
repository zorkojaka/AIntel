import { useEffect, useState } from 'react';
import type { InstallerDashboardResponse } from '../types';

const EMPTY_DATA: InstallerDashboardResponse = {
  upcomingConfirmedProjects: [],
  myMaterialOrders: [],
  myWorkOrders: [],
};

export function useInstallerDashboardData() {
  const [data, setData] = useState<InstallerDashboardResponse>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/dashboard/installer', { credentials: 'include' });
        const result = await response.json();
        if (!result?.success) {
          throw new Error(result?.error ?? 'Napaka pri nalaganju dashboard podatkov.');
        }
        if (active) {
          setData(result.data ?? EMPTY_DATA);
          setError(null);
        }
      } catch (fetchError) {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : 'Napaka pri nalaganju dashboard podatkov.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  return { data, isLoading, error };
}
