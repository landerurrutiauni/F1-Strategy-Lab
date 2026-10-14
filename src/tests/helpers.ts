import { advanceLap, defaultDecision, getPlayerCar } from '../game/engine';
import type { StorageLike } from '../game/persistence';
import type { PlayerDecision, RaceConfig, RaceState } from '../game/types';

export const baseConfig = (overrides: Partial<RaceConfig> = {}): RaceConfig => ({
  circuitId: 'sepang',
  playerDriverId: 'nor',
  laps: 15,
  startCompound: 'medium',
  weather: 'dry',
  difficulty: 'normal',
  seed: 12345,
  scenario: 'none',
  ...overrides,
});

/** Advances `n` laps with the given decision factory (default: stay out at standard pace). */
export function runLaps(state: RaceState, n: number, decide: (s: RaceState) => PlayerDecision = defaultDecision): RaceState {
  let current = state;
  for (let i = 0; i < n && current.phase === 'running'; i++) current = advanceLap(current, decide(current));
  return current;
}

/** A sensible scripted strategy: one stop for a different dry compound around mid-race. */
export function scriptedOneStop(stopLap: number, compound: PlayerDecision['compound'] = 'hard') {
  return (s: RaceState): PlayerDecision => {
    const upcoming = s.lap + 1;
    const player = getPlayerCar(s);
    return { pace: 'standard', box: upcoming === stopLap && player.status === 'running', compound, boost: false };
  };
}

export class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

export class BrokenStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('denied');
  }
  setItem(): void {
    const error = new Error('quota');
    error.name = 'QuotaExceededError';
    throw error;
  }
  removeItem(): void {
    throw new Error('denied');
  }
}
