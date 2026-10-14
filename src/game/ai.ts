import { BOOST_COST, DIFFICULTIES } from './constants';
import { getCircuit } from './data/circuits';
import { COMPOUND_ORDER, DRY_COMPOUNDS } from './data/tyres';
import { wearSmoothness } from './lapTime';
import { evaluateStrategies, type ProjectionOptions } from './projection';
import type { Rng } from './rng';
import { circuitWear, expectedWear, fastestCompoundFor, suitabilityGap } from './tyreModel';
import type { CarState, CompoundId, PaceMode, PlayerDecision, RaceState, StrategyProfile } from './types';

/**
 * Rule-based rival strategists.
 *
 * Every rival evaluates the same strategy projection the player sees, shaped by its
 * team profile (pace assumption, compound preference, aversion to stopping). It commits
 * to a planned stop lap, shifted by a per-stint tendency, and re-plans after a stop,
 * a Safety Car or a change in conditions. How quickly it reacts to those opportunities
 * depends on the difficulty. No rival ever gets free stops or special tyre rules.
 */

interface ProfileSpec {
  projection: ProjectionOptions;
  /** Tendency to pit earlier (negative) or later (positive), in laps. */
  stintTendency: number;
  /** Multiplier on the chance of reacting to a Safety Car. */
  safetyCarAppetite: number;
}

const PROFILES: Record<Exclude<StrategyProfile, 'player'>, ProfileSpec> = {
  aggressive: {
    projection: { pace: 'standard', compoundBias: { soft: -0.1, hard: 0.08 } },
    stintTendency: -1,
    safetyCarAppetite: 1,
  },
  conservative: {
    projection: { pace: 'standard', compoundBias: { hard: -0.08, soft: 0.15 }, stopPenalty: 4 },
    stintTendency: 1,
    safetyCarAppetite: 0.65,
  },
  adaptive: {
    projection: { pace: 'standard' },
    stintTendency: 0,
    safetyCarAppetite: 1.1,
  },
  balanced: {
    projection: { pace: 'standard', compoundBias: { medium: -0.05 } },
    stintTendency: 0,
    safetyCarAppetite: 0.85,
  },
};

function profileOf(car: CarState): ProfileSpec {
  return PROFILES[car.profile === 'player' ? 'balanced' : car.profile];
}

/** Draws a new per-stint tendency for a rival. */
export function drawStintOffset(car: CarState, rng: Rng, difficulty: RaceState['config']['difficulty']): number {
  if (car.isPlayer) return 0;
  const spec = profileOf(car);
  const noise = DIFFICULTIES[difficulty].planNoise;
  const tendency = rng.chance(0.5) ? spec.stintTendency : 0;
  return tendency + (noise > 0 ? rng.int(-noise, noise) : 0);
}

/** A sensible compound when a stop is forced or the plan is unavailable. */
export function fallbackCompound(car: CarState, wetness: number, lapsRemaining: number): CompoundId {
  const available = COMPOUND_ORDER.filter((c) => car.allocation[c] > 0);
  if (available.length === 0) return car.tyre.compound;
  const fastest = fastestCompoundFor(wetness, available);
  if (fastest === 'inter' || fastest === 'wet') return fastest;
  const preference: CompoundId[] =
    lapsRemaining <= 7 ? ['soft', 'medium', 'hard'] : lapsRemaining <= 13 ? ['medium', 'hard', 'soft'] : ['hard', 'medium', 'soft'];
  const usedDry = new Set(car.usedCompounds.filter((c) => DRY_COMPOUNDS.includes(c)));
  // Prefer a dry compound not yet used, to satisfy the two-compound rule.
  const unused = preference.find((c) => available.includes(c) && !usedDry.has(c));
  return unused ?? preference.find((c) => available.includes(c)) ?? fastest;
}

export interface Neighbours {
  intervalAhead: number | null;
  intervalBehind: number | null;
}

export interface AiResult {
  decision: PlayerDecision;
  plannedPitLap: number | null;
  plannedCompound: CompoundId | null;
}

export function decideAi(state: RaceState, car: CarState, rng: Rng, neighbours: Neighbours): AiResult {
  const spec = profileOf(car);
  const difficulty = DIFFICULTIES[state.config.difficulty];
  const fromLap = state.lap + 1;
  const lapsRemaining = state.totalLaps - fromLap + 1;
  const wetness = state.weather.wetness;
  const sc = state.safetyCar.active;

  let plannedPitLap = car.plannedPitLap;
  let plannedCompound = car.plannedCompound;
  // The projection is the expensive part, so it only runs when the car needs a plan,
  // is about to stop, or has an emergency.
  let cached: ReturnType<typeof evaluateStrategies> | undefined;
  const projection = () => (cached === undefined ? (cached = evaluateStrategies(state, car.id, spec.projection)) : cached);
  const outlook = car.aiNeedsPlan ? projection() : null;

  if (outlook && car.aiNeedsPlan) {
    const first = outlook.best.stops[0];
    if (first) {
      if (outlook.best.boxNow) {
        // An immediate opportunity: react now or (with lower quality) a lap late.
        const react = rng.chance(Math.min(1, difficulty.reactionChance * (sc ? spec.safetyCarAppetite : 1)));
        plannedPitLap = react ? fromLap : Math.min(fromLap + 1, state.totalLaps - 1);
      } else {
        plannedPitLap = Math.min(state.totalLaps - 1, Math.max(fromLap, first.lap + car.aiStintOffset));
      }
      plannedCompound = first.compound;
    } else {
      plannedPitLap = null;
      plannedCompound = null;
    }
  }

  let box = plannedPitLap !== null && fromLap >= plannedPitLap && fromLap < state.totalLaps;
  let compound: CompoundId = plannedCompound ?? car.tyre.compound;

  if (box) {
    const now = projection();
    if (now?.best.boxNow) compound = now.best.stops[0].compound;
  }

  // Emergencies: tyre about to fail, or badly wrong tyre for the conditions.
  const mismatch = suitabilityGap(car.tyre.compound, wetness);
  const emergency = fromLap < state.totalLaps && (car.tyre.wear >= 88 || mismatch > 6);
  if (emergency && !box) {
    box = true;
    compound = projection()?.bestBoxNow?.stops[0].compound ?? fallbackCompound(car, wetness, lapsRemaining - 1);
  }

  if (box && car.allocation[compound] <= 0) compound = fallbackCompound(car, wetness, lapsRemaining - 1);
  if (box && compound === car.tyre.compound && car.allocation[compound] <= 0) box = false;

  const pace = choosePace(car, state, neighbours, plannedPitLap);
  const boost =
    !sc &&
    car.battery >= BOOST_COST &&
    ((neighbours.intervalAhead !== null && neighbours.intervalAhead < 1) ||
      ((car.profile === 'aggressive' || car.profile === 'adaptive') &&
        neighbours.intervalBehind !== null &&
        neighbours.intervalBehind < 0.6));

  return {
    decision: { pace, box, compound: box ? compound : car.tyre.compound, boost },
    plannedPitLap,
    plannedCompound,
  };
}

function choosePace(car: CarState, state: RaceState, neighbours: Neighbours, plannedPitLap: number | null): PaceMode {
  if (state.safetyCar.active) return 'standard';
  const fromLap = state.lap + 1;
  const lapsRemaining = state.totalLaps - fromLap + 1;
  const stintLeft = plannedPitLap !== null ? plannedPitLap - fromLap + 1 : lapsRemaining;
  const wear = car.tyre.wear;
  const attacking = neighbours.intervalAhead !== null && neighbours.intervalAhead < 1.2;
  const defending = neighbours.intervalBehind !== null && neighbours.intervalBehind < 0.8;
  const circuit = getCircuit(state.config.circuitId);
  const perLap = expectedWear({
    compound: car.tyre.compound,
    pace: 'standard',
    degradation: circuitWear(circuit),
    wetness: state.weather.wetness,
    trackTemp: state.weather.trackTemp,
    safetyCar: false,
    smoothness: wearSmoothness(car),
  });
  const projectedEndWear = wear + perLap * stintLeft;

  switch (car.profile) {
    case 'aggressive':
      if (wear > 80 && stintLeft > 2) return 'conserve';
      if ((wear < 45 && stintLeft <= 6) || (attacking && wear < 70) || (lapsRemaining <= 3 && wear < 75)) return 'push';
      return 'standard';
    case 'conservative':
      if (lapsRemaining <= 2 && wear < 60) return 'push';
      if (wear > 35 && stintLeft > 3) return 'conserve';
      return 'standard';
    case 'adaptive':
      if ((attacking || defending) && wear < 70) return 'push';
      if (projectedEndWear > 85 && stintLeft > 2) return 'conserve';
      if (lapsRemaining <= 3 && projectedEndWear < 70) return 'push';
      return 'standard';
    default:
      if (lapsRemaining <= 3 && wear < 65) return 'push';
      if (wear > 75 && stintLeft > 2) return 'conserve';
      return 'standard';
  }
}

/** The AI's choice of starting compound (the player chooses their own in the briefing). */
export function chooseStartCompound(profile: StrategyProfile, wetness: number, laps: number, rng: Rng): CompoundId {
  const fastest = fastestCompoundFor(wetness);
  if (fastest === 'inter' || fastest === 'wet') return fastest;
  switch (profile) {
    case 'aggressive':
      return 'soft';
    case 'conservative':
      return laps >= 15 ? 'hard' : 'medium';
    case 'adaptive':
      return laps <= 10 ? 'soft' : 'medium';
    default:
      return rng.chance(0.5) ? 'medium' : 'soft';
  }
}
