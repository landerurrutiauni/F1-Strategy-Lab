import {
  DEG_CLIFF,
  DEG_CLIFF_EXPONENT,
  DEG_LINEAR,
  FAILURE_BASE_CHANCE,
  FAILURE_RAMP_CHANCE,
  FAILURE_WEAR_THRESHOLD,
  MAX_WEAR,
  PACE_MODES,
  REFERENCE_TRACK_TEMP,
  SC_WEAR_FACTOR,
  WEAR_PER_DEGREE,
} from './constants';
import { COMPOUNDS, COMPOUND_ORDER } from './data/tyres';
import type { CircuitSpec, CompoundId, PaceMode } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Pace lost to tyre wear (s/lap).
 *
 * Gradual at first (linear term), then increasingly steep as the tread is used up
 * (quartic term). At 50% wear a medium loses ~0.64 s, at 75% ~1.6 s, at 90% ~2.8 s
 * and at 100% ~3.9 s, so very worn tyres are strategically unattractive without a
 * sudden arbitrary cliff.
 */
export function degradationPenalty(compound: CompoundId, wear: number): number {
  const x = clamp(wear, 0, MAX_WEAR) / 100;
  return (DEG_LINEAR * x + DEG_CLIFF * x ** DEG_CLIFF_EXPONENT) * COMPOUNDS[compound].degSensitivity;
}

/**
 * Time lost because the tyre does not suit the track wetness (s/lap).
 * Zero when the tyre is in its window; grows with the size of the mismatch.
 */
export function wetnessPenalty(compound: CompoundId, wetness: number): number {
  const spec = COMPOUNDS[compound];
  const w = clamp(wetness, 0, 1);
  const diff = w - spec.idealWetness;
  if (diff >= 0) return spec.wetterPenalty * diff ** spec.mismatchExponent;
  return spec.drierPenalty * (-diff) ** spec.mismatchExponent;
}

/** Combined compound-specific pace offset on a new tyre for the given wetness (s/lap). */
export function compoundPace(compound: CompoundId, wetness: number): number {
  return COMPOUNDS[compound].dryPaceOffset + wetnessPenalty(compound, wetness);
}

/** The compound that is fastest on a new set for the given wetness. */
export function fastestCompoundFor(wetness: number, options: CompoundId[] = COMPOUND_ORDER): CompoundId {
  let best = options[0];
  let bestPace = Infinity;
  for (const id of options) {
    const pace = compoundPace(id, wetness);
    if (pace < bestPace) {
      bestPace = pace;
      best = id;
    }
  }
  return best;
}

/** How much slower a new set of `compound` is than the best compound for these conditions (s/lap). */
export function suitabilityGap(compound: CompoundId, wetness: number): number {
  const best = fastestCompoundFor(wetness);
  return Math.max(0, compoundPace(compound, wetness) - compoundPace(best, wetness));
}

/**
 * Wear multiplier from track wetness. Slicks run cooler (less wear) on a damp track;
 * treaded tyres overheat and wear quickly once the track is drier than their window.
 */
export function wetnessWearMultiplier(compound: CompoundId, wetness: number): number {
  const spec = COMPOUNDS[compound];
  if (spec.slick) return 1 - 0.5 * clamp(wetness, 0, 1);
  return 1 + 4.5 * Math.max(0, spec.idealWetness - 0.15 - wetness);
}

export function temperatureWearMultiplier(trackTemp: number): number {
  return clamp(1 + (trackTemp - REFERENCE_TRACK_TEMP) * WEAR_PER_DEGREE, 0.7, 1.4);
}

/** Reference lap length (km) for the compound wear rates. */
export const REFERENCE_LAP_KM = 5.3;

/**
 * Wear multiplier for a circuit: its abrasiveness times its lap length, so a lap of
 * Spa (7 km) wears a tyre about twice as much as a lap of Monaco (3.3 km).
 */
export function circuitWear(circuit: Pick<CircuitSpec, 'degradation' | 'lengthKm'>): number {
  return circuit.degradation * (circuit.lengthKm / REFERENCE_LAP_KM);
}

export interface WearInputs {
  compound: CompoundId;
  pace: PaceMode;
  degradation: number;
  wetness: number;
  trackTemp: number;
  safetyCar: boolean;
  smoothness?: number;
}

/** Expected wear added over one lap (%), before random variation. */
export function expectedWear(inputs: WearInputs): number {
  const spec = COMPOUNDS[inputs.compound];
  const scFactor = inputs.safetyCar ? SC_WEAR_FACTOR : 1;
  const paceFactor = inputs.safetyCar ? 1 : PACE_MODES[inputs.pace].wearMultiplier;
  return (
    spec.baseWear *
    inputs.degradation *
    paceFactor *
    temperatureWearMultiplier(inputs.trackTemp) *
    wetnessWearMultiplier(inputs.compound, inputs.wetness) *
    (inputs.smoothness ?? 1) *
    scFactor
  );
}

/** Per-lap probability of a tyre failure given wear at the start of the lap. */
export function failureChance(wear: number): number {
  if (wear < FAILURE_WEAR_THRESHOLD) return 0;
  const ramp = (wear - FAILURE_WEAR_THRESHOLD) / (MAX_WEAR - FAILURE_WEAR_THRESHOLD);
  return FAILURE_BASE_CHANCE + FAILURE_RAMP_CHANCE * clamp(ramp, 0, 1) ** 2;
}

/**
 * Laps until the tyre reaches `limit`% wear at a constant wear rate.
 * Returns Infinity when the tyre is effectively not wearing.
 */
export function lapsUntilWear(currentWear: number, wearPerLap: number, limit = 80): number {
  if (currentWear >= limit) return 0;
  if (wearPerLap <= 0.01) return Infinity;
  return Math.floor((limit - currentWear) / wearPerLap);
}
