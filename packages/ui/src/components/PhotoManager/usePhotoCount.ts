import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PhotoContext } from './PhotoManager';

type PhotoCountResponse = {
  success: boolean;
  data?: {
    photos?: unknown[];
  };
  error?: string | null;
};

function buildPhotoQuery(context: PhotoContext) {
  const params = new URLSearchParams();
  params.set('projectId', context.projectId);
  params.set('phase', context.phase);
  if (context.itemId) params.set('itemId', context.itemId);
  if (typeof context.unitIndex === 'number') params.set('unitIndex', String(context.unitIndex));
  if (context.tag) params.set('tag', context.tag);
  return params.toString();
}

export function usePhotoCount(context: PhotoContext): {
  count: number;
  loading: boolean;
  refresh: () => void;
} {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const { projectId, phase, itemId, unitIndex, tag } = context;
  const queryString = useMemo(
    () => buildPhotoQuery({ projectId, phase, itemId, unitIndex, tag }),
    [itemId, phase, projectId, tag, unitIndex],
  );

  const refresh = useCallback(() => {
    setRefreshIndex((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCount() {
      setLoading(true);
      try {
        const response = await fetch(`/api/photos?${queryString}`, {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const result = (await response.json()) as PhotoCountResponse;
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Photo count load failed');
        }
        setCount(result.data?.photos?.length ?? 0);
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        setCount(0);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadCount();
    return () => controller.abort();
  }, [queryString, refreshIndex]);

  return { count, loading, refresh };
}
