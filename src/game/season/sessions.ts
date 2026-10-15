/**
 * Pre-season testing, practice and qualifying. Each session is simulated in one go from a
 * derived seed, so the same season seed and choices always give the same timesheets.
 */
import { WET_TRACK_SLOWDOWN } from '../constants';
import { COMPOUNDS } from '../data/tyres';
import { DRIVERS, getDriver, getTeam } from '../data/teams';
import { carPaceOffset } from '../lapTime';
import { initialStats, statsPace, type CarStats } from '../manager/carStats';
import { createRng, type Rng } from '../rng';
import { compoundPace, fastestCompoundFor } from '../tyreModel';
import type { CarEffects, CircuitSpec, CompoundId, Difficulty } from '../types';
import type {
  Development,
  PracticeProgramme,
  PracticeResult,
  PracticeSessionId,
  Preparation,
  QualiChoice,
  QualiPlan,
  QualiSessionId,
  QualifyingState,
  SessionWeather,
  TestDay,
  TestProgramme,
  TimedEntry,
} from './types';

/** Low fuel and fresh tyres make a qualifying lap this much quicker than the race reference (s). */
const QUALI_FUEL_GAIN = 1.8;
/** Track evolution: the circuit gets quicker as rubber goes down in Q2 and Q3 (s). */
const TRACK_EVOLUTION = [0, -0.15, -0.3];
/** Cars left after Q1 and Q2 (22-car field: six drop out in each). */
export const QUALI_CUTS = [16, 10];

export interface SessionContext {
  circuit: CircuitSpec;
  difficulty: Difficulty;
  /** Your lead driver. */
  playerDriverId: string;
  /** Every driver you run (both cars of your team); the lead driver alone when absent. */
  managedDriverIds?: string[];
  /** Car ratings by team; the 2026 starting ratings when absent. */
  carStats?: Record<string, CarStats>;
  /** Effects for every driver in this session (team development, weekend preparation). */
  effects: Record<string, CarEffects>;
  seed: number;
}

const dryWetness = 0.15;

/** Sorts timed entries fastest first; drivers without a time go last in their original order. */
export function sortEntries(entries: TimedEntry[]): TimedEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      if (a.e.time === null && b.e.time === null) return a.i - b.i;
      if (a.e.time === null) return 1;
      if (b.e.time === null) return -1;
      return a.e.time - b.e.time;
    })
    .map(({ e }) => e);
}

const isManaged = (ctx: SessionContext, driverId: string) => (ctx.managedDriverIds ?? [ctx.playerDriverId]).includes(driverId);

/** One flying lap: car, driver, tyre, track wetness and a little noise. */
function flyingLap(ctx: SessionContext, driverId: string, compound: CompoundId, wetness: number, extra: number, rng: Rng): number {
  const driver = getDriver(driverId);
  const stats = ctx.carStats?.[driver.teamId] ?? initialStats(driver.teamId);
  const pace = carPaceOffset(
    { teamId: driver.teamId, driverId, isPlayer: isManaged(ctx, driverId), paceBonus: ctx.effects[driverId]?.pace, carPace: statsPace(stats, ctx.circuit) },
    ctx.difficulty,
  );
  const base = ctx.circuit.baseLapTime - QUALI_FUEL_GAIN + pace + compoundPace(compound, wetness) + WET_TRACK_SLOWDOWN * wetness;
  return base + extra + rng.normal(0, (0.05 + driver.consistency * 0.4) * (1 + wetness));
}

// ---------- Pre-season testing ----------

export const TEST_PROGRAMMES: Record<TestProgramme, { name: string; detail: string; area: keyof Development; fuel: number; laps: [number, number] }> = {
  aero: { name: 'Aero and setup mapping', detail: 'Rakes, flow-vis and setup sweeps. Raw pace for the season.', area: 'pace', fuel: 0.4, laps: [70, 105] },
  'race-sims': { name: 'Race simulations', detail: 'Full-tank long runs. Gentler on the tyres in races.', area: 'tyres', fuel: 1.9, laps: [110, 150] },
  'pit-practice': { name: 'Pit-stop practice', detail: 'Hundreds of stops for the crew. Quicker stationary times.', area: 'pitCrew', fuel: 1.2, laps: [60, 90] },
  mileage: { name: 'Reliability mileage', detail: 'Pile up laps on the new power unit. Fewer mechanical failures.', area: 'reliability', fuel: 1.4, laps: [130, 170] },
};

/** Each day of a programme closes part of the remaining gap to a fully developed area. */
export function developmentGain(current: number, rng: Rng): number {
  const rate = 0.32 + rng.range(-0.06, 0.08);
  return Math.min(1, current + (1 - current) * rate);
}

/**
 * A test day: everyone runs their own programme (heavy fuel hides real pace), the player's
 * programme improves one area of the car for the whole season.
 */
export function runTestDay(
  ctx: SessionContext,
  test: 1 | 2,
  day: 1 | 2 | 3,
  programme: TestProgramme,
  before: Development,
): { day: TestDay; development: Development } {
  const rng = createRng(ctx.seed);
  const spec = TEST_PROGRAMMES[programme];
  const programmes = Object.keys(TEST_PROGRAMMES) as TestProgramme[];
  const entries: TimedEntry[] = [];
  // One driver per team per day, alternating between the two team-mates.
  for (const team of new Set(DRIVERS.map((d) => d.teamId))) {
    const pair = DRIVERS.filter((d) => d.teamId === team);
    const mine = pair.some((d) => isManaged(ctx, d.id));
    const driver = pair[(test + day) % 2];
    const own = mine ? spec : TEST_PROGRAMMES[rng.pick(programmes)];
    const fuel = mine ? spec.fuel : own.fuel + rng.range(-0.4, 1.2);
    const compound: CompoundId = rng.chance(0.55) ? 'soft' : rng.chance(0.6) ? 'medium' : 'hard';
    const time = flyingLap(ctx, driver.id, compound, 0, fuel + (day === 1 && test === 1 ? 0.5 : 0), rng);
    entries.push({ driverId: driver.id, time, compound, laps: rng.int(own.laps[0], own.laps[1]) });
  }
  const development = { ...before };
  const area = spec.area;
  development[area] = developmentGain(before[area], rng);
  const notes = [
    `${spec.name}: ${areaLabel(area)} ${Math.round(before[area] * 100)}% → ${Math.round(development[area] * 100)}%.`,
    rng.pick([
      'Rivals ran unknown fuel loads, so the timesheet flatters some of them.',
      'Gusty wind in the afternoon made the balance hard to read.',
      'Sand on the track early in the day slowed everyone down.',
      'A red flag cost half an hour of running.',
      'Cooler evening running gave the most useful data.',
    ]),
  ];
  return { day: { test, day, programme, entries: sortEntries(entries), notes }, development };
}

export function areaLabel(area: keyof Development): string {
  return { pace: 'car pace', tyres: 'tyre management', pitCrew: 'pit crew', reliability: 'reliability' }[area];
}

/** Season-long car effects from pre-season development. */
export function developmentEffects(dev: Development): Required<Pick<CarEffects, 'pace' | 'wear' | 'pit'>> {
  return {
    pace: -0.25 * dev.pace,
    wear: 1 - 0.12 * dev.tyres,
    pit: 0.45 * dev.pitCrew,
  };
}

// ---------- Practice ----------

export const PRACTICE_PROGRAMMES: Record<PracticeProgramme, { name: string; detail: string; area: keyof Preparation; fuel: number }> = {
  setup: { name: 'Setup work', detail: 'Short runs between setup changes. Sharper driver feedback on the setup.', area: 'setup', fuel: 0.9 },
  'long-runs': { name: 'Long runs', detail: 'High-fuel stints on each compound. Less tyre wear in the races.', area: 'tyres', fuel: 1.9 },
  'quali-sim': { name: 'Qualifying simulation', detail: 'Low fuel and soft tyres. One-lap pace on Saturday.', area: 'quali', fuel: 0.15 },
};

/**
 * Weekend effects of the player's preparation. Setup knowledge pays off through the setup
 * itself (see the setup work in practice), so only qualifying runs and long runs appear here.
 */
export function preparationEffects(prep: Preparation, session: 'quali' | 'race'): { pace: number; wear: number } {
  return {
    pace: session === 'quali' ? -0.12 * prep.quali : 0,
    wear: session === 'race' ? 1 - 0.08 * prep.tyres : 1,
  };
}

export function runPractice(
  ctx: SessionContext,
  session: PracticeSessionId,
  programme: PracticeProgramme,
  weather: SessionWeather,
  before: Preparation,
): { result: PracticeResult; prep: Preparation } {
  const rng = createRng(ctx.seed);
  const spec = PRACTICE_PROGRAMMES[programme];
  const wetness = weather.wetness;
  const programmes = Object.keys(PRACTICE_PROGRAMMES) as PracticeProgramme[];
  const entries: TimedEntry[] = DRIVERS.map((driver) => {
    const isPlayer = isManaged(ctx, driver.id);
    const own = isPlayer ? spec : PRACTICE_PROGRAMMES[rng.pick(programmes)];
    const compound = wetness > dryWetness ? fastestCompoundFor(wetness, ['inter', 'wet']) : own.fuel < 0.5 ? 'soft' : rng.pick<CompoundId>(['soft', 'medium', 'hard']);
    const fuel = own.fuel + (isPlayer ? 0 : rng.range(-0.2, 0.5));
    const time = flyingLap(ctx, driver.id, compound, wetness, fuel + 0.35, rng);
    return { driverId: driver.id, time, compound, laps: rng.int(wetness > 0.5 ? 6 : 18, wetness > 0.5 ? 16 : 34) };
  });

  // Wet running teaches little about a dry setup.
  const wet = wetness > 0.35;
  const prep = { ...before };
  const gain = developmentGain(before[spec.area], rng) - before[spec.area];
  prep[spec.area] = Math.min(1, before[spec.area] + gain * (wet ? 0.45 : 1) * 1.5);
  // Every lap teaches a little about everything else too.
  for (const key of Object.keys(prep) as Array<keyof Preparation>) {
    if (key !== spec.area) prep[key] = Math.min(1, prep[key] + (1 - prep[key]) * (wet ? 0.04 : 0.1));
  }

  const notes = [
    `${spec.name}: ${prepLabel(spec.area)} ${Math.round(before[spec.area] * 100)}% → ${Math.round(prep[spec.area] * 100)}%.`,
  ];
  if (wet) notes.push('A wet track limited useful dry running, so the team learned less.');
  const playerEntry = entries.find((e) => e.driverId === ctx.playerDriverId)!;
  if (spec.fuel > 1) notes.push('Your cars ran heavy fuel, so the timesheet hides the real one-lap pace.');
  else if (playerEntry.time !== null) notes.push('Low-fuel running: this is close to the real one-lap pace.');
  return { result: { session, programme, wetness, entries: sortEntries(entries), notes }, prep };
}

export function prepLabel(area: keyof Preparation): string {
  return { setup: 'setup knowledge', tyres: 'tyre knowledge', quali: 'qualifying preparation' }[area];
}

// ---------- Qualifying ----------

export const QUALI_PLANS: Record<QualiPlan, { name: string; detail: string; runs: number[]; risk: number }> = {
  safe: { name: 'Bank a lap', detail: 'Two runs, the first one tidy. Rarely caught out, rarely spectacular.', runs: [0.2, 0.08], risk: 0.55 },
  standard: { name: 'Two runs', detail: 'A banker, then a proper push on the second run.', runs: [0.2, 0], risk: 1 },
  'all-in': { name: 'One late run', detail: 'A single lap on the best track at the very end. No second chance.', runs: [-0.1], risk: 1.6 },
};

/** Compounds allowed in a qualifying segment. Sprint Qualifying uses mediums in SQ1 and SQ2 and softs in SQ3 when dry. */
export function allowedCompounds(session: QualiSessionId, segment: 1 | 2 | 3, wetness: number): CompoundId[] {
  if (wetness > dryWetness) return ['soft', 'medium', 'inter', 'wet'];
  if (session === 'sprint-quali') return [segment === 3 ? 'soft' : 'medium'];
  return ['soft', 'medium', 'hard'];
}

/** Track wetness for each segment, drawn when the session starts. */
export function qualifyingWetness(weather: SessionWeather, rng: Rng): [number, number, number] {
  if (weather.scenario === 'dry') return [0, 0, 0];
  const out: number[] = [];
  let w = weather.wetness;
  for (let i = 0; i < 3; i++) {
    out.push(Math.round(Math.min(1, Math.max(0, w)) * 100) / 100);
    w += weather.scenario === 'rainy' ? rng.normal(0, 0.06) : rng.normal(-0.02, 0.12);
  }
  return out as [number, number, number];
}

export function createQualifying(session: QualiSessionId, weather: SessionWeather, seed: number): QualifyingState {
  const rng = createRng(seed);
  return { session, wetness: qualifyingWetness(weather, rng), segments: [], grid: null, savedSoftSets: {} };
}

/** The choice the team strategist would make (also used by the AI teams). */
export function suggestedQualiChoice(session: QualiSessionId, segment: 1 | 2 | 3, wetness: number): QualiChoice {
  const allowed = allowedCompounds(session, segment, wetness);
  return { compound: fastestCompoundFor(wetness, allowed), plan: 'standard' };
}

function runLap(ctx: SessionContext, driverId: string, choice: QualiChoice, wetness: number, segment: number, rng: Rng): TimedEntry {
  const driver = getDriver(driverId);
  const plan = QUALI_PLANS[choice.plan];
  let best: number | null = null;
  let note: string | undefined;
  for (const runOffset of plan.runs) {
    const mismatch = Math.max(0, compoundPace(choice.compound, wetness) - compoundPace(fastestCompoundFor(wetness), wetness));
    const mistake = 0.045 * driver.errorProneness * plan.risk * (1 + 1.5 * wetness) * (1 + Math.min(mismatch, 6) * 0.25);
    let time = flyingLap(ctx, driverId, choice.compound, wetness, TRACK_EVOLUTION[segment - 1] + runOffset, rng);
    if (choice.plan === 'all-in' && rng.chance(0.12)) {
      time += rng.range(0.25, 0.7);
      note = 'Caught in traffic';
    }
    if (rng.chance(mistake)) {
      if (rng.chance(0.55)) {
        note = 'Lap deleted for track limits';
        continue;
      }
      time += rng.range(0.3, 1.2);
      note = 'Mistake on the lap';
    }
    if (best === null || time < best) best = time;
  }
  return { driverId, time: best, compound: choice.compound, laps: plan.runs.length * 3, note: best === null ? note ?? 'No time set' : note };
}

/** AI teams: the fastest legal tyre; aggressive teams sometimes gamble on a single late run. */
function aiChoice(session: QualiSessionId, segment: 1 | 2 | 3, wetness: number, driverId: string, rng: Rng): QualiChoice {
  const choice = suggestedQualiChoice(session, segment, wetness);
  const profile = getTeam(getDriver(driverId).teamId).profile;
  if (profile === 'aggressive' && rng.chance(0.3)) return { ...choice, plan: 'all-in' };
  if (profile === 'conservative' && rng.chance(0.3)) return { ...choice, plan: 'safe' };
  return choice;
}

/** Drivers still running in the next segment. */
export function qualifyingParticipants(state: QualifyingState): string[] {
  if (state.segments.length === 0) return DRIVERS.map((d) => d.id);
  const last = state.segments[state.segments.length - 1];
  const out = new Set(last.eliminated);
  return last.entries.map((e) => e.driverId).filter((id) => !out.has(id));
}

/**
 * Runs the next segment (Q1, Q2 or Q3). The player's choice is used when the player is still
 * in the session; afterwards the remaining segments can be run with `null`.
 */
export function runQualifyingSegment(state: QualifyingState, ctx: SessionContext, playerChoices: Record<string, QualiChoice> | null): QualifyingState {
  if (state.grid) return state;
  const index = (state.segments.length + 1) as 1 | 2 | 3;
  const rng = createRng(ctx.seed);
  const wetness = state.wetness[index - 1];
  const participants = qualifyingParticipants(state);
  const allowed = allowedCompounds(state.session, index, wetness);
  const choices: Record<string, QualiChoice> = {};
  const entries = participants.map((id) => {
    const isPlayer = isManaged(ctx, id);
    const given = isPlayer ? playerChoices?.[id] : undefined;
    let c = given ?? (isPlayer ? suggestedQualiChoice(state.session, index, wetness) : aiChoice(state.session, index, wetness, id, rng));
    if (!allowed.includes(c.compound)) c = { ...c, compound: fastestCompoundFor(wetness, allowed) };
    if (isPlayer) choices[id] = c;
    return runLap(ctx, id, c, wetness, index, rng);
  });
  const sorted = sortEntries(entries);
  const keep = index < 3 ? QUALI_CUTS[index - 1] : sorted.length;
  const eliminated = sorted.slice(keep).map((e) => e.driverId);
  const segments = [...state.segments, { index, wetness, entries: sorted, eliminated, choices }];
  const saved = { ...state.savedSoftSets };
  if (state.session === 'quali' && wetness <= dryWetness && index < 3) {
    for (const [id, c] of Object.entries(choices)) if (c.compound === 'medium' && !eliminated.includes(id)) saved[id] = Math.min(2, (saved[id] ?? 0) + 1);
  }
  const next: QualifyingState = { ...state, segments, savedSoftSets: saved };
  if (index === 3) next.grid = qualifyingGrid(segments);
  return next;
}

/** Q3 order, then the Q2 and Q1 eliminations in the order they were set. */
export function qualifyingGrid(segments: QualifyingState['segments']): string[] {
  const grid: string[] = [];
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    const ids = i === segments.length - 1 ? seg.entries.map((e) => e.driverId) : seg.eliminated;
    for (const id of ids) if (!grid.includes(id)) grid.push(id);
  }
  return grid;
}

export function compoundShort(compound: CompoundId): string {
  return COMPOUNDS[compound].name;
}
