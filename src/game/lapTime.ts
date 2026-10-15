import {
  BOOST_LAP_GAIN,
  FUEL_EFFECT_PER_LAP,
  PACE_MODES,
  SC_LAP_FACTOR,
  START_LAP_EXTRA,
  WET_TRACK_SLOWDOWN,
  DIFFICULTIES,
} from './constants';
import { COMPOUNDS } from './data/tyres';
import { getDriver, getTeam } from './data/teams';
import { degradationPenalty, wetnessPenalty } from './tyreModel';
import type { CarState, CircuitSpec, Difficulty, LapTimeBreakdown, PaceMode, TyreSet } from './types';

/**
 * Lap time model (all values in seconds):
 *
 *   lap = base circuit lap
 *       − fuel burn (FUEL_EFFECT_PER_LAP × laps already run)
 *       + car & driver offset (+ difficulty adjustment for rivals only)
 *       + compound dry pace offset
 *       + degradation penalty (non-linear in wear)
 *       + weather: general wet-track slowdown + tyre/wetness mismatch
 *       + pace mode delta
 *       + warm-up on the first lap of a fresh set
 *       − energy boost
 *       + standing-start extra on lap 1
 *
 * Random variation, traffic, mistakes and pit stops are applied by the engine on top
 * of this deterministic value, so the projection model and the race share one formula.
 */
export interface LapInputs {
  circuit: CircuitSpec;
  lapNumber: number;
  wetness: number;
  tyre: TyreSet;
  pace: PaceMode;
  carOffset: number;
  boost: boolean;
  /** True when this is the first lap on a set fitted at a pit stop. */
  freshFromPit: boolean;
}

export function computeLapTime(input: LapInputs): LapTimeBreakdown {
  const { circuit, lapNumber, wetness, tyre, pace } = input;
  const spec = COMPOUNDS[tyre.compound];
  const base = circuit.baseLapTime;
  const fuel = -FUEL_EFFECT_PER_LAP * Math.max(0, lapNumber - 1);
  const compound = spec.dryPaceOffset;
  const degradation = degradationPenalty(tyre.compound, tyre.wear);
  const weather = WET_TRACK_SLOWDOWN * wetness + wetnessPenalty(tyre.compound, wetness);
  const paceDelta = PACE_MODES[pace].lapDelta;
  const warmUp = input.freshFromPit ? spec.warmUpPenalty : 0;
  const boost = input.boost ? -BOOST_LAP_GAIN : 0;
  const start = lapNumber === 1 ? START_LAP_EXTRA : 0;
  const total = base + fuel + input.carOffset + compound + degradation + weather + paceDelta + warmUp + boost + start;
  return {
    base,
    fuel,
    car: input.carOffset,
    compound,
    degradation,
    weather,
    pace: paceDelta,
    warmUp,
    boost,
    start,
    total,
  };
}

/** Lap time behind the Safety Car: everyone circulates at the same controlled pace. */
export function safetyCarLapTime(circuit: CircuitSpec, wetness: number): number {
  return circuit.baseLapTime * SC_LAP_FACTOR + WET_TRACK_SLOWDOWN * wetness * 0.5;
}

/** Car + driver pace offset, including the difficulty adjustment that applies to rivals only. */
export function carPaceOffset(car: Pick<CarState, 'teamId' | 'driverId' | 'isPlayer' | 'paceBonus' | 'carPace'>, difficulty: Difficulty): number {
  const driver = getDriver(car.driverId);
  const rivalAdjust = car.isPlayer ? 0 : DIFFICULTIES[difficulty].rivalPace;
  // Circuit-specific car pace from the car's ratings; the team's overall pace for older saves.
  const carPace = car.carPace ?? getTeam(car.teamId).carPace;
  return carPace + driver.skill + rivalAdjust + (car.paceBonus ?? 0);
}

/** Tyre-wear multiplier for a car: the driver's smoothness times any season effect. */
export function wearSmoothness(car: Pick<CarState, 'driverId' | 'wearFactor'>): number {
  return getDriver(car.driverId).tyreSmoothness * (car.wearFactor ?? 1);
}
