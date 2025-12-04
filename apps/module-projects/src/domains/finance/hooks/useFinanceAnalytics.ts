import { useCallback, useEffect, useState } from "react";

type Filters = { from?: string; to?: string; company?: string; projectId?: string };

type FetchState<T> = {
  data: T;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
};

function buildQuery(filters?: Filters) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.company) params.set("company", filters.company);
  if (filters?.projectId) params.set("projectId", filters.projectId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function useFinanceEndpoint<T>(endpoint: string, filters?: Filters, initial: T): FetchState<T> {
  const [data, setData] = useState<T>(initial);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/finance/${endpoint}${buildQuery(filters)}`);
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error ?? "Napaka pri nalaganju podatkov.");
      }
      setData(payload.data ?? initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Napaka pri nalaganju podatkov.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, filters?.from, filters?.to, filters?.company, filters?.projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

export function useProjectsSummary(filters?: Filters) {
  return useFinanceEndpoint<any[]>("projects-summary", filters, []);
}

export function useMonthlySummary(filters?: Filters) {
  return useFinanceEndpoint<any[]>("monthly-summary", filters, []);
}

export function useEmployeesSummary(filters?: Filters) {
  return useFinanceEndpoint<any[]>("employees-summary", filters, []);
}

export function useFinanceInvoices(filters?: Filters) {
  return useFinanceEndpoint<any[]>("invoices", filters, []);
}
