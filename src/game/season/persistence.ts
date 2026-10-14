import { CIRCUITS } from '../data/circuits';
import { getBrowserStorage, type StorageLike } from '../persistence';
import { isValidSeasonConfig } from './season';
import type { SeasonState } from './types';

/** The championship in progress (one save slot). */
export const SEASON_KEY = 'f1sl.season.v1';

function looksLikeSeason(value: unknown): value is SeasonState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<SeasonState>;
  return (
    s.version === 1 &&
    isValidSeasonConfig(s.config) &&
    (s.phase === 'testing' || s.phase === 'weekend' || s.phase === 'finished') &&
    typeof s.round === 'number' &&
    s.round >= 1 &&
    s.round <= CIRCUITS.length &&
    !!s.testing &&
    Array.isArray(s.testing.days) &&
    Array.isArray(s.results) &&
    !!s.teamForm &&
    !!s.teamDevelopment &&
    !!s.reliability &&
    Array.isArray(s.news) &&
    (s.phase !== 'weekend' || (!!s.weekend && Array.isArray(s.weekend.sessions) && typeof s.weekend.next === 'number'))
  );
}

/** Saves the season; returns false when the browser refuses to store it. */
export function saveSeason(season: SeasonState, storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SEASON_KEY, JSON.stringify(season));
    return true;
  } catch {
    return false;
  }
}

/** Loads the saved season, discarding anything unreadable. */
export function loadSeason(storage: StorageLike | null = getBrowserStorage()): SeasonState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SEASON_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (looksLikeSeason(parsed)) return parsed;
    storage.removeItem(SEASON_KEY);
    return null;
  } catch {
    return null;
  }
}

export function clearSeason(storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(SEASON_KEY);
    return true;
  } catch {
    return false;
  }
}
