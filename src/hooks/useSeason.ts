import { useCallback, useRef, useState } from 'react';
import { clearSeason, loadSeason, saveSeason } from '../game/season/persistence';
import type { SeasonState } from '../game/season/types';

export interface SeasonController {
  season: SeasonState | null;
  /** False when the last change could not be written to browser storage. */
  saved: boolean;
  /** Applies a pure update and saves the result. */
  update(fn: (season: SeasonState) => SeasonState): void;
  replace(season: SeasonState | null): void;
}

export function useSeason(): SeasonController {
  const [season, setSeason] = useState<SeasonState | null>(() => loadSeason());
  const [saved, setSaved] = useState(true);
  // Latest state for updates fired in quick succession (before a re-render).
  const current = useRef(season);

  const update = useCallback((fn: (season: SeasonState) => SeasonState) => {
    const prev = current.current;
    if (!prev) return;
    const next = fn(prev);
    if (next === prev) return;
    current.current = next;
    setSeason(next);
    setSaved(saveSeason(next));
  }, []);

  const replace = useCallback((next: SeasonState | null) => {
    current.current = next;
    setSeason(next);
    setSaved(next ? saveSeason(next) : clearSeason());
  }, []);

  return { season, saved, update, replace };
}
