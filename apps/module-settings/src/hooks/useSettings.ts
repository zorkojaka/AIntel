import { useCallback, useEffect, useState } from 'react';
import { applySettingsTheme, fetchSettings, DEFAULT_SETTINGS } from '../api';
import { SettingsDto } from '../types';

interface UseSettingsOptions {
  applyTheme?: boolean;
}

interface UseSettingsResult {
  settings: SettingsDto;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSettingsData(options: UseSettingsOptions = {}): UseSettingsResult {
  const { applyTheme = true } = options;
  const [settings, setSettings] = useState<SettingsDto>(() => ({ ...DEFAULT_SETTINGS }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchSettings();
      setSettings(response);
      setError(null);
      if (applyTheme) {
        applySettingsTheme(response);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Napaka pri nalaganju nastavitev.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { settings, loading, error, refresh };
}
