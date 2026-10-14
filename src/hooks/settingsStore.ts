import { createContext } from 'react';
import { getBrowserStorage, type StorageLike } from '../game/persistence';

export type MotionSetting = 'system' | 'reduced' | 'full';
export type GapMode = 'interval' | 'leader';

export interface Settings {
  motion: MotionSetting;
  sound: boolean;
  gapMode: GapMode;
  showProjections: boolean;
  confirmLeave: boolean;
  /** Playback speed of the live race, as a multiple of real time. */
  raceSpeed: RaceSpeed;
  /** Pause the live race for Safety Cars, weather changes and problems with your car. */
  pauseOnEvents: boolean;
}

export type RaceSpeed = 4 | 8 | 16 | 32 | 64;
export const RACE_SPEEDS: RaceSpeed[] = [4, 8, 16, 32, 64];

export const DEFAULT_SETTINGS: Settings = {
  motion: 'system',
  sound: false,
  gapMode: 'interval',
  showProjections: true,
  confirmLeave: true,
  raceSpeed: 16,
  pauseOnEvents: true,
};

export const SETTINGS_KEY = 'f1-strategy-lab:settings:v1';

export function loadSettings(storage: StorageLike | null = getBrowserStorage()): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      motion: parsed.motion === 'reduced' || parsed.motion === 'full' || parsed.motion === 'system' ? parsed.motion : DEFAULT_SETTINGS.motion,
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULT_SETTINGS.sound,
      gapMode: parsed.gapMode === 'leader' || parsed.gapMode === 'interval' ? parsed.gapMode : DEFAULT_SETTINGS.gapMode,
      showProjections: typeof parsed.showProjections === 'boolean' ? parsed.showProjections : DEFAULT_SETTINGS.showProjections,
      confirmLeave: typeof parsed.confirmLeave === 'boolean' ? parsed.confirmLeave : DEFAULT_SETTINGS.confirmLeave,
      raceSpeed: RACE_SPEEDS.includes(parsed.raceSpeed as RaceSpeed) ? (parsed.raceSpeed as RaceSpeed) : DEFAULT_SETTINGS.raceSpeed,
      pauseOnEvents: typeof parsed.pauseOnEvents === 'boolean' ? parsed.pauseOnEvents : DEFAULT_SETTINGS.pauseOnEvents,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings, storage: StorageLike | null = getBrowserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** False when the last change could not be written to storage. */
  persisted: boolean;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);
