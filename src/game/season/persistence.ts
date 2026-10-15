import { CIRCUITS } from '../data/circuits';
import { CUSTOM_TEAM_ID, activateCustomTeam } from '../manager/customTeam';
import { getBrowserStorage, type StorageLike } from '../persistence';
import { isValidSeasonConfig } from './season';
import type { SeasonState } from './types';

/** The Team Principal career in progress (one save slot). */
export const SEASON_KEY = 'f1sl.career.v1';
/** Save key of the earlier driver-only season mode; such saves are not compatible and are cleared. */
const LEGACY_SEASON_KEY = 'f1sl.season.v1';

function looksLikeSeason(value: unknown): value is SeasonState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<SeasonState>;
  return (
    s.version === 2 &&
    isValidSeasonConfig(s.config) &&
    (s.phase === 'testing' || s.phase === 'weekend' || s.phase === 'finished') &&
    typeof s.round === 'number' &&
    s.round >= 1 &&
    s.round <= CIRCUITS.length &&
    !!s.testing &&
    Array.isArray(s.testing.days) &&
    Array.isArray(s.results) &&
    !!s.teamDevelopment &&
    !!s.reliability &&
    !!s.carStats &&
    !!s.carStats[s.config.teamId] &&
    !!s.facilities &&
    !!s.finance &&
    typeof s.finance.balance === 'number' &&
    Array.isArray(s.finance.ledger) &&
    Array.isArray(s.sponsors) &&
    Array.isArray(s.projects) &&
    Array.isArray(s.upgrades) &&
    Array.isArray(s.inbox) &&
    typeof s.date === 'string' &&
    typeof s.nextId === 'number' &&
    typeof s.boardTarget === 'number' &&
    Array.isArray(s.news) &&
    (s.phase !== 'weekend' || (!!s.weekend && Array.isArray(s.weekend.sessions) && typeof s.weekend.next === 'number' && !!s.weekend.setups))
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
    if (storage.getItem(LEGACY_SEASON_KEY) !== null) storage.removeItem(LEGACY_SEASON_KEY);
    const raw = storage.getItem(SEASON_KEY);
    if (!raw) {
      activateCustomTeam(null);
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SeasonState> | null;
    // A team of your own has to be on the grid before the rest of the career can be checked.
    activateCustomTeam(parsed?.config?.teamId === CUSTOM_TEAM_ID ? parsed.config.customTeam : null);
    if (looksLikeSeason(parsed)) return parsed;
    activateCustomTeam(null);
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
