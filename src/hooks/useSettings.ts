import { use, useSyncExternalStore } from 'react';
import { SettingsContext, type SettingsContextValue } from './settingsStore';

export function useSettings(): SettingsContextValue {
  const ctx = use(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

const motionQuery = '(prefers-reduced-motion: reduce)';

function subscribeMotion(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(motionQuery);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function systemPrefersReduced() {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(motionQuery).matches;
}

/** True when animations should be minimised (setting or OS preference). */
export function useReducedMotion(): boolean {
  const { settings } = useSettings();
  const system = useSyncExternalStore(subscribeMotion, systemPrefersReduced, () => false);
  if (settings.motion === 'reduced') return true;
  if (settings.motion === 'full') return false;
  return system;
}
