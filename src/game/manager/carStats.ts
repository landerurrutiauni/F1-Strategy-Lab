/**
 * Car performance as five ratings (0–100). Each circuit weights the cornering and straight-line
 * ratings differently, so a car can be quick at Monza and struggle in Monaco. Values are
 * illustrative, chosen for gameplay; they are not measured data.
 */
import { TEAMS, getTeam } from '../data/teams';
import type { CircuitSpec } from '../types';

export type CarStat = 'lowSpeed' | 'mediumSpeed' | 'highSpeed' | 'straightLine' | 'tyreCare';
export type CarStats = Record<CarStat, number>;

export const CAR_STATS: CarStat[] = ['lowSpeed', 'mediumSpeed', 'highSpeed', 'straightLine', 'tyreCare'];

export const STAT_LABEL: Record<CarStat, string> = {
  lowSpeed: 'Low-speed corners',
  mediumSpeed: 'Medium-speed corners',
  highSpeed: 'High-speed corners',
  straightLine: 'Straight-line speed',
  tyreCare: 'Tyre care',
};

/** Rating that gives a neutral car (no time gained or lost). */
const REFERENCE = 65;
/** Lap time per rating point at full circuit weight (s). */
const SECONDS_PER_POINT = 0.03;
/** Tyre wear change per tyre-care point. */
const WEAR_PER_POINT = 0.004;

/** Character of each 2026 car around its overall level (illustrative). */
const CHARACTER: Record<string, Partial<CarStats>> = {
  mercedes: { highSpeed: 4, straightLine: 2, lowSpeed: -3, tyreCare: -2 },
  ferrari: { lowSpeed: 4, mediumSpeed: 2, highSpeed: -2, straightLine: -2, tyreCare: 1 },
  mclaren: { mediumSpeed: 3, tyreCare: 5, highSpeed: 1, straightLine: -4, lowSpeed: -2 },
  redbull: { straightLine: 5, highSpeed: 2, lowSpeed: -4, tyreCare: -2 },
  racingbulls: { straightLine: 3, lowSpeed: -2, tyreCare: -1 },
  alpine: { lowSpeed: 2, straightLine: -2 },
  haas: { highSpeed: 2, tyreCare: -3, mediumSpeed: 1 },
  audi: { mediumSpeed: 2, straightLine: -2 },
  williams: { straightLine: 6, lowSpeed: -5, highSpeed: 1, tyreCare: -2 },
  astonmartin: { lowSpeed: 3, straightLine: -3 },
  cadillac: { tyreCare: 2, highSpeed: -2 },
};

/** Starting ratings: the team's overall pace spread over the five ratings by its character. */
export function initialStats(teamId: string): CarStats {
  const overall = REFERENCE - getTeam(teamId).carPace / SECONDS_PER_POINT;
  const character = CHARACTER[teamId] ?? {};
  const stats = {} as CarStats;
  for (const stat of CAR_STATS) stats[stat] = Math.round(Math.min(99, Math.max(20, overall + (character[stat] ?? 0))));
  return stats;
}

export function allInitialStats(): Record<string, CarStats> {
  return Object.fromEntries(TEAMS.map((t) => [t.id, initialStats(t.id)]));
}

type Weights = Record<Exclude<CarStat, 'tyreCare'>, number>;

const BY_SECTOR: Record<CircuitSpec['sector'], Weights> = {
  street: { lowSpeed: 0.45, mediumSpeed: 0.25, highSpeed: 0.1, straightLine: 0.2 },
  speed: { lowSpeed: 0.15, mediumSpeed: 0.15, highSpeed: 0.25, straightLine: 0.45 },
  flowing: { lowSpeed: 0.1, mediumSpeed: 0.3, highSpeed: 0.45, straightLine: 0.15 },
  abrasive: { lowSpeed: 0.15, mediumSpeed: 0.35, highSpeed: 0.35, straightLine: 0.15 },
};

const OVERRIDES: Record<string, Weights> = {
  monaco: { lowSpeed: 0.7, mediumSpeed: 0.2, highSpeed: 0.05, straightLine: 0.05 },
  'marina-bay': { lowSpeed: 0.55, mediumSpeed: 0.3, highSpeed: 0.05, straightLine: 0.1 },
  hungaroring: { lowSpeed: 0.35, mediumSpeed: 0.45, highSpeed: 0.1, straightLine: 0.1 },
  monza: { lowSpeed: 0.1, mediumSpeed: 0.1, highSpeed: 0.2, straightLine: 0.6 },
  'las-vegas': { lowSpeed: 0.25, mediumSpeed: 0.1, highSpeed: 0.1, straightLine: 0.55 },
  baku: { lowSpeed: 0.4, mediumSpeed: 0.05, highSpeed: 0.05, straightLine: 0.5 },
  spa: { lowSpeed: 0.1, mediumSpeed: 0.1, highSpeed: 0.4, straightLine: 0.4 },
  silverstone: { lowSpeed: 0.05, mediumSpeed: 0.25, highSpeed: 0.55, straightLine: 0.15 },
  suzuka: { lowSpeed: 0.1, mediumSpeed: 0.3, highSpeed: 0.5, straightLine: 0.1 },
  zandvoort: { lowSpeed: 0.15, mediumSpeed: 0.45, highSpeed: 0.35, straightLine: 0.05 },
};

/** How much each rating matters at a circuit (cornering and straights add up to 1). */
export function circuitWeights(circuit: Pick<CircuitSpec, 'id' | 'sector'>): Weights {
  return OVERRIDES[circuit.id] ?? BY_SECTOR[circuit.sector];
}

/** The car's pace at a circuit (s/lap relative to a neutral car; negative is faster). */
export function statsPace(stats: CarStats, circuit: Pick<CircuitSpec, 'id' | 'sector'>): number {
  const w = circuitWeights(circuit);
  let pace = 0;
  for (const stat of Object.keys(w) as Array<keyof Weights>) pace += w[stat] * (REFERENCE - stats[stat]) * SECONDS_PER_POINT;
  return pace;
}

/** Tyre-wear multiplier from the tyre-care rating. */
export function statsWear(stats: CarStats): number {
  return Math.max(0.8, Math.min(1.2, 1 - (stats.tyreCare - REFERENCE) * WEAR_PER_POINT));
}

/** Overall rating shown in the UI (average of the cornering and straight-line ratings). */
export function overallRating(stats: CarStats): number {
  return Math.round((stats.lowSpeed + stats.mediumSpeed + stats.highSpeed + stats.straightLine) / 4);
}
