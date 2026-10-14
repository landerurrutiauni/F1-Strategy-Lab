import { useCallback, useState } from 'react';
import { COMPOUND_ORDER } from '../game/data/tyres';
import { advanceLap, createRace, defaultDecision, getPlayerCar, simulateToFinish, validateDecision } from '../game/engine';
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
  decision: PlayerDecision;
  decisionError: string | null;
  saveStatus: SaveStatus;
  start(config: RaceConfig): RaceState;
  resume(): boolean;
  updateDecision(patch: Partial<PlayerDecision>): void;
  advance(): RaceState | null;
  finishAfterRetirement(): RaceState | null;
  abandon(): void;
}

/** Keeps the selected compound if the next stop could still use it, otherwise the first available set. */
function nextDecision(state: RaceState, previous: PlayerDecision): PlayerDecision {
  const player = getPlayerCar(state);
  const keep = player.allocation[previous.compound] > 0 && previous.compound !== player.tyre.compound;
  const fallback = COMPOUND_ORDER.find((c) => player.allocation[c] > 0 && c !== player.tyre.compound) ?? player.tyre.compound;
  return {
    pace: previous.pace,
    box: false,
    compound: keep ? previous.compound : fallback,
    boost: false,
  };
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
  const [decision, setDecision] = useState<PlayerDecision>({ pace: 'standard', box: false, compound: 'medium', boost: false });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle' });

  const start = useCallback((config: RaceConfig) => {
    const state = createRace(config);
    const initial = nextDecision(state, defaultDecision(state));
    setRace(state);
    setDecision(initial);
    setSaveStatus({ kind: 'idle' });
    saveActiveRace(state, initial);
    return state;
  }, []);

  const resume = useCallback(() => {
    const saved = loadActiveRace();
    if (!saved) return false;
    setRace(saved.state);
    setDecision(saved.decision);
    setSaveStatus({ kind: 'idle' });
    return true;
  }, []);

  const updateDecision = useCallback((patch: Partial<PlayerDecision>) => {
    setDecision((prev) => ({ ...prev, ...patch }));
  }, []);

  const advance = useCallback(() => {
    if (!race || race.phase !== 'running') return null;
    if (validateDecision(race, decision)) return null;
    const next = advanceLap(race, decision);
    setRace(next);
    if (next.phase === 'finished') {
      setSaveStatus(finalize(next));
    } else {
      const upcoming = nextDecision(next, decision);
      setDecision(upcoming);
      saveActiveRace(next, upcoming);
    }
    return next;
  }, [race, decision]);

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

  const decisionError = race && race.phase === 'running' ? validateDecision(race, decision) : null;

  return { race, decision, decisionError, saveStatus, start, resume, updateDecision, advance, finishAfterRetirement, abandon };
}
