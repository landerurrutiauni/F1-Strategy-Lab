import { getCircuit, isCircuitId } from './data/circuits';
import { isCompoundId } from './data/tyres';
import { getDriver, getTeam, isDriverId } from './data/teams';
import { getPlayerCar, validateConfig } from './engine';
import { rateStrategy } from './rating';
import type { CompoundId, Difficulty, PlayerDecision, RaceState, WeatherScenario } from './types';

/**
 * Local persistence for completed races, settings and the race in progress.
 * Everything is versioned and validated on load; unreadable data is ignored rather
 * than crashing the game.
 */

export const RECORDS_KEY = 'f1-strategy-lab:records:v1';
export const ACTIVE_RACE_KEY = 'f1-strategy-lab:active-race:v1';
export const MAX_RECORDS = 60;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface RaceRecord {
  id: string;
  date: string;
  driverId: string;
  driverName: string;
  teamName: string;
  circuitId: string;
  circuitName: string;
  laps: number;
  weather: WeatherScenario;
  difficulty: Difficulty;
  seed: number;
  startCompound: CompoundId;
  gridPosition: number;
  position: number;
  finished: boolean;
  totalTime: number | null;
  gapToWinner: number | null;
  winnerName: string;
  pitStops: number;
  pitTimeLost: number;
  stints: Array<{ compound: CompoundId; laps: number }>;
  ratingScore: number;
  ratingGrade: string;
  bestLap: number | null;
}

interface RecordsFile {
  version: 1;
  races: RaceRecord[];
}

export type SaveResult = { ok: true } | { ok: false; error: string };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);

export function isRaceRecord(value: unknown): value is RaceRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.date === 'string' &&
    isDriverId(r.driverId) &&
    typeof r.driverName === 'string' &&
    typeof r.teamName === 'string' &&
    isCircuitId(r.circuitId) &&
    typeof r.circuitName === 'string' &&
    isNum(r.laps) &&
    (r.weather === 'dry' || r.weather === 'variable' || r.weather === 'rainy') &&
    (r.difficulty === 'easy' || r.difficulty === 'normal' || r.difficulty === 'hard') &&
    isNum(r.seed) &&
    isCompoundId(r.startCompound) &&
    isNum(r.gridPosition) &&
    isNum(r.position) &&
    typeof r.finished === 'boolean' &&
    isNumOrNull(r.totalTime) &&
    isNumOrNull(r.gapToWinner) &&
    typeof r.winnerName === 'string' &&
    isNum(r.pitStops) &&
    isNum(r.pitTimeLost) &&
    Array.isArray(r.stints) &&
    r.stints.every((s) => s && typeof s === 'object' && isCompoundId((s as { compound: unknown }).compound) && isNum((s as { laps: unknown }).laps)) &&
    isNum(r.ratingScore) &&
    typeof r.ratingGrade === 'string' &&
    isNumOrNull(r.bestLap)
  );
}

export interface LoadedRecords {
  races: RaceRecord[];
  /** Set when stored data had to be ignored. */
  warning: string | null;
}

export function loadRecords(storage: StorageLike | null = getBrowserStorage()): LoadedRecords {
  if (!storage) return { races: [], warning: 'Local storage is unavailable, so records cannot be saved in this browser.' };
  let raw: string | null;
  try {
    raw = storage.getItem(RECORDS_KEY);
  } catch {
    return { races: [], warning: 'Local storage could not be read.' };
  }
  if (!raw) return { races: [], warning: null };
  try {
    const parsed = JSON.parse(raw) as Partial<RecordsFile>;
    if (!parsed || !Array.isArray(parsed.races)) return { races: [], warning: 'Saved records were in an unknown format and were ignored.' };
    const races = parsed.races.filter(isRaceRecord);
    const dropped = parsed.races.length - races.length;
    return {
      races,
      warning: dropped > 0 ? `${dropped} saved race${dropped > 1 ? 's were' : ' was'} unreadable and skipped.` : null,
    };
  } catch {
    return { races: [], warning: 'Saved records were unreadable and were ignored.' };
  }
}

export function saveRaceRecord(record: RaceRecord, storage: StorageLike | null = getBrowserStorage()): SaveResult {
  if (!storage) return { ok: false, error: 'Local storage is unavailable in this browser.' };
  if (!isRaceRecord(record)) return { ok: false, error: 'The race record is incomplete.' };
  const { races } = loadRecords(storage);
  const next: RecordsFile = {
    version: 1,
    races: [record, ...races.filter((r) => r.id !== record.id)].slice(0, MAX_RECORDS),
  };
  try {
    storage.setItem(RECORDS_KEY, JSON.stringify(next));
    // Read back to confirm the write actually persisted.
    const check = loadRecords(storage);
    if (!check.races.some((r) => r.id === record.id)) return { ok: false, error: 'The record could not be verified after saving.' };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.name === 'QuotaExceededError' ? 'Browser storage is full.' : 'The record could not be written to storage.' };
  }
}

export function clearRecords(storage: StorageLike | null = getBrowserStorage()): SaveResult {
  if (!storage) return { ok: false, error: 'Local storage is unavailable in this browser.' };
  try {
    storage.removeItem(RECORDS_KEY);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Records could not be cleared.' };
  }
}

export function buildRaceRecord(state: RaceState, now: Date = new Date()): RaceRecord {
  if (state.phase !== 'finished' || !state.classification) throw new Error('Race is not finished.');
  const player = getPlayerCar(state);
  const entry = state.classification.find((e) => e.carId === player.id)!;
  const winner = state.classification[0];
  const winnerCar = state.cars.find((c) => c.id === winner.carId)!;
  const rating = rateStrategy(state);
  return {
    id: `${state.config.seed}-${now.getTime()}`,
    date: now.toISOString(),
    driverId: player.driverId,
    driverName: getDriver(player.driverId).name,
    teamName: getTeam(player.teamId).name,
    circuitId: state.config.circuitId,
    circuitName: getCircuit(state.config.circuitId).grandPrix,
    laps: state.totalLaps,
    weather: state.config.weather,
    difficulty: state.config.difficulty,
    seed: state.config.seed,
    startCompound: state.config.startCompound,
    gridPosition: player.gridPosition,
    position: entry.position,
    finished: entry.status === 'finished',
    totalTime: entry.status === 'finished' ? entry.totalTime : null,
    gapToWinner: entry.gapToWinner,
    winnerName: getDriver(winnerCar.driverId).name,
    pitStops: player.pitStops.length,
    pitTimeLost: player.pitStops.reduce((s, p) => s + p.totalLoss, 0),
    stints: player.stints.filter((s) => s.laps > 0).map((s) => ({ compound: s.compound, laps: s.laps })),
    ratingScore: rating.score,
    ratingGrade: rating.grade,
    bestLap: player.bestLapTime,
  };
}

export interface CareerStats {
  races: number;
  wins: number;
  podiums: number;
  finishes: number;
  retirements: number;
  averageFinish: number | null;
  bestScore: number | null;
  bestByCircuit: Record<string, { position: number; totalTime: number | null; laps: number; date: string }>;
}

export function computeStats(races: RaceRecord[]): CareerStats {
  const finishedRaces = races.filter((r) => r.finished);
  const bestByCircuit: CareerStats['bestByCircuit'] = {};
  for (const r of races) {
    const current = bestByCircuit[r.circuitId];
    if (!current || r.position < current.position || (r.position === current.position && (r.totalTime ?? Infinity) < (current.totalTime ?? Infinity))) {
      bestByCircuit[r.circuitId] = { position: r.position, totalTime: r.totalTime, laps: r.laps, date: r.date };
    }
  }
  return {
    races: races.length,
    wins: finishedRaces.filter((r) => r.position === 1).length,
    podiums: finishedRaces.filter((r) => r.position <= 3).length,
    finishes: finishedRaces.length,
    retirements: races.length - finishedRaces.length,
    averageFinish: finishedRaces.length ? finishedRaces.reduce((s, r) => s + r.position, 0) / finishedRaces.length : null,
    bestScore: races.length ? Math.max(...races.map((r) => r.ratingScore)) : null,
    bestByCircuit,
  };
}

/* ---------- Race in progress ---------- */

interface ActiveRaceFile {
  version: 1;
  state: RaceState;
  decision: PlayerDecision;
}

function isPlausibleRaceState(value: unknown): value is RaceState {
  if (!value || typeof value !== 'object') return false;
  const s = value as RaceState;
  return (
    s.version === 1 &&
    s.phase === 'running' &&
    validateConfig(s.config).length === 0 &&
    Array.isArray(s.cars) &&
    s.cars.length > 0 &&
    s.cars.some((c) => c && c.isPlayer) &&
    Number.isInteger(s.lap) &&
    s.lap >= 0 &&
    s.lap < s.totalLaps &&
    Array.isArray(s.weatherTimeline) &&
    Array.isArray(s.events) &&
    Array.isArray(s.decisionLog) &&
    typeof s.rngState === 'number'
  );
}

export function saveActiveRace(state: RaceState, decision: PlayerDecision, storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false;
  try {
    if (state.phase !== 'running') {
      storage.removeItem(ACTIVE_RACE_KEY);
      return true;
    }
    const file: ActiveRaceFile = { version: 1, state, decision };
    storage.setItem(ACTIVE_RACE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

export function loadActiveRace(storage: StorageLike | null = getBrowserStorage()): ActiveRaceFile | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ACTIVE_RACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveRaceFile>;
    if (parsed?.version !== 1 || !isPlausibleRaceState(parsed.state) || !parsed.decision) {
      storage.removeItem(ACTIVE_RACE_KEY);
      return null;
    }
    return parsed as ActiveRaceFile;
  } catch {
    try {
      storage.removeItem(ACTIVE_RACE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function clearActiveRace(storage: StorageLike | null = getBrowserStorage()) {
  try {
    storage?.removeItem(ACTIVE_RACE_KEY);
  } catch {
    /* ignore */
  }
}
