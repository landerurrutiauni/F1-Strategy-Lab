import { useCallback, useState } from 'react';
import { COMPOUND_ORDER } from '../game/data/tyres';
import { advanceLap, createRace, defaultDecision, getManagedCars, getPlayerCar, simulateToFinish, validateDecision } from '../game/engine';
import {
  buildRaceRecord,
  clearActiveRace,
  loadActiveRace,
  saveActiveRace,
  saveRaceRecord,
} from '../game/persistence';
import type { PlayerDecision, RaceConfig, RaceState } from '../game/types';

export type SaveStatus = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string };

export interface RaceController {
  race: RaceState | null;
  /** Pending call for each managed car, keyed by car id. */
  decisions: Record<string, PlayerDecision>;
  /** Problem with each car's pending call (null when it can be applied). */
  decisionErrors: Record<string, string | null>;
  saveStatus: SaveStatus;
  start(config: RaceConfig): RaceState;
  resume(): boolean;
  updateDecision(carId: string, patch: Partial<PlayerDecision>): void;
  /** Runs the next lap with the pending calls (or `override`, e.g. corrected ones). */
  advance(override?: Record<string, PlayerDecision>): RaceState | null;
  finishAfterRetirement(): RaceState | null;
  abandon(): void;
}

/** Keeps the selected compound if the next stop could still use it, otherwise the first available set. */
function nextDecision(state: RaceState, previous: PlayerDecision, carId: string): PlayerDecision {
  const player = state.cars.find((c) => c.id === carId) ?? getPlayerCar(state);
  const keep = player.allocation[previous.compound] > 0 && previous.compound !== player.tyre.compound;
  const fallback = COMPOUND_ORDER.find((c) => player.allocation[c] > 0 && c !== player.tyre.compound) ?? player.tyre.compound;
  return {
    pace: previous.pace,
    box: false,
    compound: keep ? previous.compound : fallback,
    boost: false,
  };
}

/** Next pending call for every managed car, carrying over pace and tyre choice. */
function nextDecisions(state: RaceState, previous: Record<string, PlayerDecision>): Record<string, PlayerDecision> {
  const out: Record<string, PlayerDecision> = {};
  for (const car of getManagedCars(state)) out[car.id] = nextDecision(state, previous[car.id] ?? defaultDecision(state, car.id), car.id);
  return out;
}

function finalize(next: RaceState): SaveStatus {
  clearActiveRace();
  try {
    const result = saveRaceRecord(buildRaceRecord(next));
    return result.ok ? { kind: 'saved' } : { kind: 'error', message: result.error };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'The result could not be saved.' };
  }
}

export function useRaceController(): RaceController {
  const [race, setRace] = useState<RaceState | null>(null);
  const [decisions, setDecisions] = useState<Record<string, PlayerDecision>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle' });

  const start = useCallback((config: RaceConfig) => {
    const state = createRace(config);
    const initial = nextDecisions(state, {});
    setRace(state);
    setDecisions(initial);
    setSaveStatus({ kind: 'idle' });
    saveActiveRace(state, initial);
    return state;
  }, []);

  const resume = useCallback(() => {
    const saved = loadActiveRace();
    if (!saved) return false;
    setRace(saved.state);
    setDecisions(saved.decisions ?? nextDecisions(saved.state, { [getPlayerCar(saved.state).id]: saved.decision }));
    setSaveStatus({ kind: 'idle' });
    return true;
  }, []);

  const updateDecision = useCallback((carId: string, patch: Partial<PlayerDecision>) => {
    setDecisions((prev) => ({ ...prev, [carId]: { ...(prev[carId] ?? { pace: 'standard', box: false, compound: 'medium', boost: false }), ...patch } }));
  }, []);

  const advance = useCallback(
    (override?: Record<string, PlayerDecision>) => {
      if (!race || race.phase !== 'running') return null;
      const applied = override ?? decisions;
      if (Object.entries(applied).some(([carId, d]) => validateDecision(race, d, carId))) return null;
      const next = advanceLap(race, applied);
      setRace(next);
      if (next.phase === 'finished') {
        setSaveStatus(finalize(next));
      } else {
        const upcoming = nextDecisions(next, applied);
        setDecisions(upcoming);
        saveActiveRace(next, upcoming);
      }
      return next;
    },
    [race, decisions],
  );

  const finishAfterRetirement = useCallback(() => {
    if (!race || race.phase !== 'running') return null;
    const next = simulateToFinish(race);
    setRace(next);
    setSaveStatus(finalize(next));
    return next;
  }, [race]);

  const abandon = useCallback(() => {
    clearActiveRace();
    setRace(null);
    setSaveStatus({ kind: 'idle' });
  }, []);

  const decisionErrors: Record<string, string | null> = {};
  if (race && race.phase === 'running') for (const [carId, d] of Object.entries(decisions)) decisionErrors[carId] = validateDecision(race, d, carId);

  return { race, decisions, decisionErrors, saveStatus, start, resume, updateDecision, advance, finishAfterRetirement, abandon };
}
