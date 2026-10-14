import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SettingsContext, loadSettings, saveSettings, type Settings } from './settingsStore';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [persisted, setPersisted] = useState(true);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      setPersisted(saveSettings(next));
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = settings.motion;
  }, [settings.motion]);

  const value = useMemo(() => ({ settings, update, persisted }), [settings, update, persisted]);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}
