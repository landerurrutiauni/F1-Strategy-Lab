/**
 * Balancing parameters for the race simulation.
 *
 * Every number here is a fictional, illustrative value chosen for gameplay.
 * None of it represents real team telemetry. Units are noted per constant.
 */
import type { Difficulty, PaceMode } from './types';

/** Lap-time gain from fuel burn per completed lap (s). */
export const FUEL_EFFECT_PER_LAP = 0.07;

/** Extra time on lap 1 for the standing start (s). */
export const START_LAP_EXTRA = 2.6;

/** Elapsed-time offset between consecutive grid slots at the start (s). */
export const GRID_SPACING = 0.32;

/** Wear-based pace penalty: LINEAR * x + CLIFF * x^CLIFF_EXPONENT, x = wear / 100 (s). */
export const DEG_LINEAR = 0.9;
export const DEG_CLIFF = 3.4;
export const DEG_CLIFF_EXPONENT = 4;

/** Wear is capped here; the penalty curve is steep but finite (%). */
export const MAX_WEAR = 100;

/** Wear above which tyres become at risk of failure (%). */
export const FAILURE_WEAR_THRESHOLD = 85;
/** Base per-lap failure probability once past the threshold. */
export const FAILURE_BASE_CHANCE = 0.04;
/** Additional per-lap failure probability at 100% wear (quadratic ramp). */
export const FAILURE_RAMP_CHANCE = 0.3;
/** Time lost limping back to the pit lane after a failure (s). */
export const FAILURE_TIME_LOSS = 24;

/** General slowdown from a wet track regardless of tyre choice (s per wetness unit). */
export const WET_TRACK_SLOWDOWN = 8.5;

/** Reference track temperature for the wear model (°C). */
export const REFERENCE_TRACK_TEMP = 35;
/** Wear multiplier change per °C away from the reference temperature. */
export const WEAR_PER_DEGREE = 0.012;

/** Track wetness moves toward the rain intensity each lap at these rates. */
export const WETTING_RATE = 0.65;
export const DRYING_RATE = 0.28;

export interface PaceModeSpec {
  id: PaceMode;
  label: string;
  /** Lap-time adjustment (s). */
  lapDelta: number;
  /** Tyre wear multiplier. */
  wearMultiplier: number;
  /** Mistake probability multiplier. */
  riskMultiplier: number;
  description: string;
}

export const PACE_MODES: Record<PaceMode, PaceModeSpec> = {
  conserve: {
    id: 'conserve',
    label: 'Conserve',
    lapDelta: 0.45,
    wearMultiplier: 0.65,
    riskMultiplier: 0.5,
    description: 'Manage the tyres. Slower laps, much less wear, fewer mistakes.',
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    lapDelta: 0,
    wearMultiplier: 1,
    riskMultiplier: 1,
    description: 'Balanced race pace and tyre wear.',
  },
  push: {
    id: 'push',
    label: 'Push',
    lapDelta: -0.35,
    wearMultiplier: 1.6,
    riskMultiplier: 2.4,
    description: 'Attack. Faster laps, heavier wear and a higher chance of a mistake.',
  },
};

/** Energy store (0..100) used for the overtake boost. */
export const BOOST_COST = 35;
export const BOOST_LAP_GAIN = 0.3;
/** Extra effective pace when attacking with the boost (s). */
export const BOOST_ATTACK_BONUS = 0.25;
/** Effective pace when defending with the boost (s). */
export const BOOST_DEFEND_BONUS = 0.15;
export const BATTERY_RECHARGE = 15;
export const BATTERY_RECHARGE_SC = 30;

/** Minimum time gap a following car can hold at the line (s). */
export const FOLLOW_GAP_MIN = 0.3;
export const FOLLOW_GAP_MAX = 0.65;
/** Time lost by both cars in a successful overtake (s). */
export const OVERTAKE_TIME_COST = 0.15;
/** Logistic scale of overtake probability (s). */
export const OVERTAKE_SPREAD = 0.35;
/** Dirty-air penalty when finishing within this gap of the car ahead (s). */
export const DIRTY_AIR_WINDOW = 1.0;
export const DIRTY_AIR_PENALTY = 0.12;

/** Safety Car lap time as a multiple of the circuit base lap. */
export const SC_LAP_FACTOR = 1.38;
/** Share of the gap to the car ahead removed per Safety Car lap. */
export const SC_CLOSE_RATE = 0.65;
/** Minimum gap between cars in the Safety Car train (s). */
export const SC_TRAIN_GAP = 0.6;
/** Pit-lane loss multiplier under the Safety Car: the field is slow, so the lane costs less. */
export const SC_PIT_FACTOR = 0.5;
/** Tyre wear multiplier under the Safety Car. */
export const SC_WEAR_FACTOR = 0.25;
/** Safety Car duration range in laps (inclusive). */
export const SC_MIN_LAPS = 2;
export const SC_MAX_LAPS = 3;

/** Stationary pit stop time (s). */
export const PIT_STATIONARY_MEAN = 2.6;
export const PIT_STATIONARY_SD = 0.2;
export const SLOW_STOP_CHANCE = 0.07;
export const SLOW_STOP_MIN = 2.5;
export const SLOW_STOP_MAX = 6;
export const FAST_STOP_CHANCE = 0.07;
export const FAST_STOP_GAIN = 0.4;

/** Base per-lap mistake probability (before pace, weather and driver multipliers). */
export const BASE_ERROR_CHANCE = 0.009;
export const ERROR_MIN_LOSS = 1.0;
export const ERROR_MAX_LOSS = 3.5;
/** Probability that a mistake becomes a retirement, dry and when on a mismatched tyre. */
export const CRASH_SHARE_DRY = 0.08;
export const CRASH_SHARE_MISMATCH = 0.22;
/** Extra wear from a lock-up / off-track moment (%). */
export const ERROR_WEAR = 3;

/**
 * Two different dry compounds must be used in a race run entirely on slicks.
 * Breaking the rule adds this time penalty at the flag (s).
 */
export const COMPOUND_RULE_PENALTY = 40;

/** Sprint distance for each Grand Prix distance (real Sprints are about a third of a Grand Prix). */
export const SPRINT_LAPS = { 10: 5, 15: 8, 20: 10 } as const;
export const VALID_RACE_LAPS = [10, 15, 20];
export const VALID_SPRINT_LAPS = [5, 8, 10];

/** Championship points (2026 regulations: no bonus point for the fastest lap). */
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

/** Radar horizon in laps. */
export const FORECAST_HORIZON = 5;

export interface DifficultySpec {
  id: Difficulty;
  label: string;
  /** Rival car pace adjustment (s/lap). Never applied to the player. */
  rivalPace: number;
  /** Rival mistake multiplier. */
  rivalErrors: number;
  /** Probability rivals react to an opportunity (Safety Car, weather) on the lap it appears. */
  reactionChance: number;
  /** Random spread added to rivals' planned stint lengths (laps). */
  planNoise: number;
  description: string;
}

export const DIFFICULTIES: Record<Difficulty, DifficultySpec> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    rivalPace: 0.3,
    rivalErrors: 1.4,
    reactionChance: 0.45,
    planNoise: 2,
    description: 'Rivals are 0.3 s/lap slower, react late to Safety Cars and weather, and make more mistakes.',
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    rivalPace: 0,
    rivalErrors: 1,
    reactionChance: 0.75,
    planNoise: 1,
    description: 'Rivals run their natural pace and usually react to Safety Cars and weather.',
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    rivalPace: -0.15,
    rivalErrors: 0.7,
    reactionChance: 0.95,
    planNoise: 0,
    description: 'Rivals are 0.15 s/lap quicker, plan precisely and almost never miss an opportunity.',
  },
};
