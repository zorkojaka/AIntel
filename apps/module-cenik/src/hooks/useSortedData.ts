import { useMemo, useState } from 'react';

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  column: string | null;
  direction: SortDirection;
}

export function useSortedData<T extends Record<string, any>>(data: T[]) {
  const [sort, setSort] = useState<SortState>({ column: null, direction: null });

  const handleSort = (column: string) => {
    setSort((prev) => ({
      column,
      direction: prev.column === column ? (prev.direction === 'asc' ? 'desc' : 'asc') : 'asc'
    }));
  };

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sort.column!] ?? '';
      const bVal = b[sort.column!] ?? '';
      const cmp =
        typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal), 'sl');

      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [data, sort]);

  return { sorted, sort, handleSort };
}
