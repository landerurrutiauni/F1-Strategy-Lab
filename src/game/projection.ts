import {
  COMPOUND_RULE_PENALTY,
  FAILURE_TIME_LOSS,
  MAX_WEAR,
  PIT_STATIONARY_MEAN,
  SC_PIT_FACTOR,
} from './constants';
import { getCircuit } from './data/circuits';
import { COMPOUNDS, COMPOUND_ORDER, DRY_COMPOUNDS } from './data/tyres';
import { carPaceOffset, computeLapTime, safetyCarLapTime, wearSmoothness } from './lapTime';
import { expectedWear, failureChance } from './tyreModel';
import { climatologyRain, nextWetness } from './weather';
import type { CarState, CircuitSpec, CompoundId, PaceMode, RaceSession, RaceState } from './types';

/**
 * Strategy projection.
 *
 * Estimates the remaining race time for every zero-, one- and two-stop plan using the
 * same lap-time and wear formulas as the race engine, but without random variation,
 * traffic, mistakes or rival behaviour. Future track wetness comes from the radar
 * forecast (persisting the last estimate beyond the horizon). Known Safety Car laps
 * are included. Expected tyre-failure losses are added as a risk cost.
 *
 * Results are estimates: they are only as good as the forecast and ignore traffic.
 */

export interface PlanStop {
  lap: number;
  compound: CompoundId;
}

export interface ProjectedPlan {
  stops: PlanStop[];
  /** Projected elapsed time at the flag, including rule penalties and risk cost (s). */
  totalTime: number;
  /** Seconds slower than the best plan. */
  delta: number;
  penalty: number;
  riskCost: number;
  boxNow: boolean;
  /** Highest wear reached on any stint (%). */
  maxWear: number;
}

export interface StrategyOutlook {
  fromLap: number;
  plans: ProjectedPlan[];
  best: ProjectedPlan;
  bestStayOut: ProjectedPlan | null;
  bestBoxNow: ProjectedPlan | null;
  boxNowByCompound: Partial<Record<CompoundId, ProjectedPlan>>;
  /** Range of first-stop laps whose plans are within 1.5 s of the best plan. */
  pitWindow: { start: number; end: number } | null;
  /** Box-now minus stay-out projected time (negative: pitting now is estimated quicker). */
  pitNowDelta: number | null;
  expectedWetness: number[];
  /** Laps (from the upcoming one) run under the Safety Car in the projection. */
  safetyCarLaps: number;
}

export interface ProjectionOptions {
  pace?: PaceMode;
  maxStops?: number;
  /** Extra cost per stop (s), used by risk-averse rivals. */
  stopPenalty?: number;
  /** Per-lap preference bias by compound (s/lap, negative = preferred). */
  compoundBias?: Partial<Record<CompoundId, number>>;
}

interface StintTable {
  /** cumulative[k] = time to run laps fromLap..fromLap+k on this set. */
  cumulative: number[];
  risk: number[];
  wear: number[];
}

interface ProjectionContext {
  circuit: CircuitSpec;
  car: CarState;
  fromLap: number;
  totalLaps: number;
  wetness: number[];
  scLaps: Set<number>;
  trackTemp: number;
  carOffset: number;
  smoothness: number;
  /** Seconds off the stationary time from the car's pit crew. */
  pitBonus: number;
  session: RaceSession;
  pace: PaceMode;
  bias: Partial<Record<CompoundId, number>>;
}

const FAILURE_EXPECTED_COST = FAILURE_TIME_LOSS * 1.5;

function buildContext(state: RaceState, car: CarState, options: ProjectionOptions): ProjectionContext {
  const circuit = getCircuit(state.config.circuitId);
  const fromLap = state.lap + 1;
  const totalLaps = state.totalLaps;
  const wetness: number[] = [];
  let w = state.weather.wetness;
  let lastRain = state.weather.rain;
  const climate = climatologyRain(state.config.weather);
  for (let lap = fromLap; lap <= totalLaps; lap++) {
    if (lap > fromLap) {
      const entry = state.forecast.find((f) => f.lap === lap);
      // Inside the radar horizon use the estimate; beyond it, blend toward the scenario's typical rain.
      lastRain = entry ? entry.rain : lastRain * 0.6 + climate * 0.4;
      w = nextWetness(w, lastRain);
    }
    wetness.push(w);
  }
  const scLaps = new Set<number>();
  if (state.safetyCar.active) {
    for (let i = 0; i < state.safetyCar.lapsRemaining; i++) scLaps.add(fromLap + i);
  }
  return {
    circuit,
    car,
    fromLap,
    totalLaps,
    wetness,
    scLaps,
    trackTemp: state.weather.trackTemp,
    carOffset: carPaceOffset(car, state.config.difficulty),
    smoothness: wearSmoothness(car),
    pitBonus: car.pitBonus ?? 0,
    session: state.config.session ?? 'race',
    pace: options.pace ?? 'standard',
    bias: options.compoundBias ?? {},
  };
}

/** Simulates running one tyre set from `startLap` to the end of the race. */
function buildStint(ctx: ProjectionContext, compound: CompoundId, startLap: number, startWear: number, freshFirstLap: boolean): StintTable {
  const cumulative: number[] = [];
  const risk: number[] = [];
  const wearTrace: number[] = [];
  let wear = startWear;
  let time = 0;
  let riskTotal = 0;
  let fresh = freshFirstLap;
  for (let lap = startLap; lap <= ctx.totalLaps; lap++) {
    const wetness = ctx.wetness[lap - ctx.fromLap];
    const sc = ctx.scLaps.has(lap);
    let lapTime: number;
    if (sc) {
      lapTime = safetyCarLapTime(ctx.circuit, wetness);
    } else {
      lapTime =
        computeLapTime({
          circuit: ctx.circuit,
          lapNumber: lap,
          wetness,
          tyre: { compound, wear, age: 0 },
          pace: ctx.pace,
          carOffset: ctx.carOffset,
          boost: false,
          freshFromPit: fresh,
        }).total + (ctx.bias[compound] ?? 0);
      riskTotal += failureChance(wear) * FAILURE_EXPECTED_COST;
    }
    wear = Math.min(
      MAX_WEAR,
      wear +
        expectedWear({
          compound,
          pace: ctx.pace,
          degradation: ctx.circuit.degradation,
          wetness,
          trackTemp: ctx.trackTemp,
          safetyCar: sc,
          smoothness: ctx.smoothness,
        }),
    );
    fresh = false;
    time += lapTime;
    cumulative.push(time);
    risk.push(riskTotal);
    wearTrace.push(wear);
  }
  return { cumulative, risk, wear: wearTrace };
}

function pitCost(ctx: ProjectionContext, lap: number, stopPenalty: number): number {
  const lane = ctx.scLaps.has(lap) ? ctx.circuit.pitLaneLoss * SC_PIT_FACTOR : ctx.circuit.pitLaneLoss;
  return lane + PIT_STATIONARY_MEAN - ctx.pitBonus + stopPenalty;
}

/**
 * Penalty for finishing a fully dry Grand Prix without using two different dry compounds.
 * Sprints have no such rule.
 */
export function compoundRulePenalty(compounds: Iterable<CompoundId>, session: RaceSession = 'race'): number {
  if (session === 'sprint') return 0;
  const set = new Set(compounds);
  if (set.has('inter') || set.has('wet')) return 0;
  const dryUsed = DRY_COMPOUNDS.filter((c) => set.has(c)).length;
  return dryUsed >= 2 ? 0 : COMPOUND_RULE_PENALTY;
}

export function planLabel(stops: PlanStop[]): string {
  if (stops.length === 0) return 'No more stops';
  return stops.map((s) => `Box lap ${s.lap}: ${COMPOUNDS[s.compound].name}`).join(', then ');
}

function rangeSum(table: StintTable, from: number, to: number, startLap: number): { time: number; risk: number; wear: number } {
  const i = to - startLap;
  const j = from - startLap - 1;
  const time = table.cumulative[i] - (j >= 0 ? table.cumulative[j] : 0);
  const risk = table.risk[i] - (j >= 0 ? table.risk[j] : 0);
  return { time, risk, wear: table.wear[i] };
}

/**
 * Evaluates all zero-, one- and two-stop plans for a car from the upcoming lap.
 * Returns null when the car or race can no longer make decisions.
 */
export function evaluateStrategies(state: RaceState, carId: string, options: ProjectionOptions = {}): StrategyOutlook | null {
  const car = state.cars.find((c) => c.id === carId);
  if (!car || car.status !== 'running' || state.phase !== 'running') return null;
  const ctx = buildContext(state, car, options);
  const { fromLap, totalLaps } = ctx;
  const maxStops = options.maxStops ?? 2;
  const stopPenalty = options.stopPenalty ?? 0;
  const lastLap = totalLaps;

  const freshCurrent = car.tyre.age === 0 && car.pitStops.length > 0;
  const current = buildStint(ctx, car.tyre.compound, fromLap, car.tyre.wear, freshCurrent);

  // Fresh-set tables: fresh[compound][startLap]
  const fresh = new Map<CompoundId, Map<number, StintTable>>();
  const available = COMPOUND_ORDER.filter((c) => car.allocation[c] > 0);
  for (const compound of available) {
    const byStart = new Map<number, StintTable>();
    for (let start = fromLap + 1; start <= lastLap; start++) byStart.set(start, buildStint(ctx, compound, start, 0, true));
    fresh.set(compound, byStart);
  }

  const baseUsed = new Set<CompoundId>([...car.usedCompounds, car.tyre.compound]);
  const plans: ProjectedPlan[] = [];

  const finalize = (stops: PlanStop[], time: number, risk: number, maxWear: number) => {
    const used = new Set(baseUsed);
    stops.forEach((s) => used.add(s.compound));
    const penalty = compoundRulePenalty(used, ctx.session);
    plans.push({
      stops,
      totalTime: car.elapsed + time + risk + penalty,
      delta: 0,
      penalty,
      riskCost: risk,
      boxNow: stops.length > 0 && stops[0].lap === fromLap,
      maxWear,
    });
  };

  // Zero stops.
  {
    const run = rangeSum(current, fromLap, lastLap, fromLap);
    finalize([], run.time, run.risk, run.wear);
  }

  if (maxStops >= 1) {
    for (let p1 = fromLap; p1 <= lastLap - 1; p1++) {
      const first = rangeSum(current, fromLap, p1, fromLap);
      const cost1 = pitCost(ctx, p1, stopPenalty);
      for (const c1 of available) {
        const t1 = fresh.get(c1)!.get(p1 + 1)!;
        const tail = rangeSum(t1, p1 + 1, lastLap, p1 + 1);
        finalize(
          [{ lap: p1, compound: c1 }],
          first.time + cost1 + tail.time,
          first.risk + tail.risk,
          Math.max(first.wear, tail.wear),
        );
        if (maxStops < 2) continue;
        for (let p2 = p1 + 1; p2 <= lastLap - 1; p2++) {
          const mid = rangeSum(t1, p1 + 1, p2, p1 + 1);
          const cost2 = pitCost(ctx, p2, stopPenalty);
          for (const c2 of available) {
            if (c2 === c1 && car.allocation[c1] < 2) continue;
            const t2 = fresh.get(c2)!.get(p2 + 1)!;
            const end = rangeSum(t2, p2 + 1, lastLap, p2 + 1);
            finalize(
              [
                { lap: p1, compound: c1 },
                { lap: p2, compound: c2 },
              ],
              first.time + cost1 + mid.time + cost2 + end.time,
              first.risk + mid.risk + end.risk,
              Math.max(first.wear, mid.wear, end.wear),
            );
          }
        }
      }
    }
  }

  plans.sort((a, b) => a.totalTime - b.totalTime);
  const best = plans[0];
  for (const plan of plans) plan.delta = plan.totalTime - best.totalTime;

  const bestStayOut = plans.find((p) => !p.boxNow) ?? null;
  const bestBoxNow = plans.find((p) => p.boxNow) ?? null;
  const boxNowByCompound: Partial<Record<CompoundId, ProjectedPlan>> = {};
  for (const plan of plans) {
    if (!plan.boxNow) continue;
    const c = plan.stops[0].compound;
    if (!boxNowByCompound[c]) boxNowByCompound[c] = plan;
  }

  let pitWindow: StrategyOutlook['pitWindow'] = null;
  if (best.stops.length > 0) {
    const candidates = plans.filter((p) => p.stops.length > 0 && p.delta <= 1.5).map((p) => p.stops[0].lap);
    pitWindow = { start: Math.min(...candidates), end: Math.max(...candidates) };
  }

  return {
    fromLap,
    plans,
    best,
    bestStayOut,
    bestBoxNow,
    boxNowByCompound,
    pitWindow,
    pitNowDelta: bestBoxNow && bestStayOut ? bestBoxNow.totalTime - bestStayOut.totalTime : null,
    expectedWetness: ctx.wetness,
    safetyCarLaps: ctx.scLaps.size,
  };
}

/**
 * Picks up to `count` distinct, useful alternatives for display: the best plan, the
 * best plan with a different first action, and the best plan with a different number of stops.
 */
export function highlightPlans(outlook: StrategyOutlook, count = 3, includeFirstActionAlternative = true): ProjectedPlan[] {
  const chosen: ProjectedPlan[] = [outlook.best];
  const signature = (p: ProjectedPlan) => p.stops.map((s) => `${s.lap}${s.compound}`).join('|');
  const has = (p: ProjectedPlan) => chosen.some((c) => signature(c) === signature(p));
  const alt = outlook.best.boxNow ? outlook.bestStayOut : outlook.bestBoxNow;
  if (includeFirstActionAlternative && alt && !has(alt)) chosen.push(alt);
  const otherStops = outlook.plans.find((p) => p.stops.length !== outlook.best.stops.length && !has(p));
  if (otherStops && chosen.length < count) chosen.push(otherStops);
  for (const plan of outlook.plans) {
    if (chosen.length >= count) break;
    const differentCompound = plan.stops[0]?.compound !== outlook.best.stops[0]?.compound;
    if (!has(plan) && differentCompound) chosen.push(plan);
  }
  return chosen.slice(0, count);
}

/** Lap-by-lap projected elapsed time for a specific plan (used for the pre-race baseline). */
export function tracePlan(state: RaceState, carId: string, stops: PlanStop[]): number[] {
  const car = state.cars.find((c) => c.id === carId);
  if (!car) return [];
  const ctx = buildContext(state, car, {});
  // Dense array (index = lap) so it survives JSON round-trips; earlier laps hold the start time.
  const trace: number[] = Array.from({ length: ctx.fromLap }, () => car.elapsed);
  let elapsed = car.elapsed;
  let compound = car.tyre.compound;
  let wear = car.tyre.wear;
  let fresh = false;
  for (let lap = ctx.fromLap; lap <= ctx.totalLaps; lap++) {
    const wetness = ctx.wetness[lap - ctx.fromLap];
    const sc = ctx.scLaps.has(lap);
    let lapTime = sc
      ? safetyCarLapTime(ctx.circuit, wetness)
      : computeLapTime({
          circuit: ctx.circuit,
          lapNumber: lap,
          wetness,
          tyre: { compound, wear, age: 0 },
          pace: 'standard',
          carOffset: ctx.carOffset,
          boost: false,
          freshFromPit: fresh,
        }).total;
    wear = Math.min(
      MAX_WEAR,
      wear +
        expectedWear({
          compound,
          pace: 'standard',
          degradation: ctx.circuit.degradation,
          wetness,
          trackTemp: ctx.trackTemp,
          safetyCar: sc,
          smoothness: ctx.smoothness,
        }),
    );
    fresh = false;
    const stop = stops.find((s) => s.lap === lap);
    if (stop) {
      lapTime += pitCost(ctx, lap, 0);
      compound = stop.compound;
      wear = 0;
      fresh = true;
    }
    elapsed += lapTime;
    trace[lap] = elapsed;
  }
  return trace;
}

export interface RejoinEstimate {
  position: number;
  aheadId: string | null;
  gapAhead: number | null;
  behindId: string | null;
  gapBehind: number | null;
  pitLoss: number;
}

/**
 * Where the car would rejoin if it boxed at the end of the upcoming lap, assuming
 * everyone else stays out and laps at their expected pace.
 */
export function estimateRejoin(state: RaceState, carId: string): RejoinEstimate | null {
  const car = state.cars.find((c) => c.id === carId);
  if (!car || car.status !== 'running' || state.phase !== 'running') return null;
  const circuit = getCircuit(state.config.circuitId);
  const lap = state.lap + 1;
  const sc = state.safetyCar.active;
  const expectedEnd = (c: CarState) =>
    c.elapsed +
    (sc
      ? safetyCarLapTime(circuit, state.weather.wetness)
      : computeLapTime({
          circuit,
          lapNumber: lap,
          wetness: state.weather.wetness,
          tyre: c.tyre,
          pace: 'standard',
          carOffset: carPaceOffset(c, state.config.difficulty),
          boost: false,
          freshFromPit: false,
        }).total);
  const pitLoss = (sc ? circuit.pitLaneLoss * SC_PIT_FACTOR : circuit.pitLaneLoss) + PIT_STATIONARY_MEAN - (car.pitBonus ?? 0);
  const mine = expectedEnd(car) + pitLoss;
  const others = state.cars
    .filter((c) => c.id !== carId && c.status === 'running')
    .map((c) => ({ id: c.id, end: expectedEnd(c) }))
    .sort((a, b) => a.end - b.end);
  const ahead = others.filter((o) => o.end <= mine);
  const behind = others.filter((o) => o.end > mine);
  const a = ahead[ahead.length - 1];
  const b = behind[0];
  return {
    position: ahead.length + 1,
    aheadId: a?.id ?? null,
    gapAhead: a ? mine - a.end : null,
    behindId: b?.id ?? null,
    gapBehind: b ? b.end - mine : null,
    pitLoss,
  };
}
