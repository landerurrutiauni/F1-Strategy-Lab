/**
 * Championship mode: pre-season testing, then every round of the 2026 calendar with its
 * practice, (Sprint) qualifying, Sprint and Grand Prix sessions. Pure functions: every update
 * returns a new season state.
 */
import { RACE_POINTS, SPRINT_POINTS } from '../constants';
import { CIRCUITS, TESTING_CIRCUIT, getCircuit } from '../data/circuits';
import { DRIVERS, TEAMS, getDriver, isDriverId } from '../data/teams';
import { advanceLap, getPlayerCar } from '../engine';
import { evaluateStrategies } from '../projection';
import { rateStrategy } from '../rating';
import { createRng, deriveSeed, normalizeSeed } from '../rng';
import type { CarEffects, CompoundId, PlayerDecision, RaceConfig, RaceState } from '../types';
import { generateWeekendWeather, weekendSessions } from './calendar';
import {
  createQualifying,
  developmentEffects,
  preparationEffects,
  runPractice,
  runQualifyingSegment,
  runTestDay,
  type SessionContext,
} from './sessions';
import type {
  Development,
  PracticeProgramme,
  QualiChoice,
  QualiSessionId,
  RaceResult,
  ResultRow,
  RoundResult,
  SeasonConfig,
  SeasonState,
  SessionId,
  StandingRow,
  TestProgramme,
  WeekendState,
} from './types';

export const TEST_DAYS: Array<{ test: 1 | 2; day: 1 | 2 | 3; date: string }> = [
  { test: 1, day: 1, date: '11 Feb' },
  { test: 1, day: 2, date: '12 Feb' },
  { test: 1, day: 3, date: '13 Feb' },
  { test: 2, day: 1, date: '18 Feb' },
  { test: 2, day: 2, date: '19 Feb' },
  { test: 2, day: 3, date: '20 Feb' },
];

const ZERO_DEV: Development = { pace: 0, tyres: 0, pitCrew: 0, reliability: 0 };

/** Expected mechanical retirements per car per race at average reliability. */
const FAILURES_PER_RACE = 0.05;

// Salts keep every session's random stream independent of the others.
const SALT = { setup: 11, testing: 101, weekend: 211, practice: 307, quali: 401, race: 503, form: 601 };

const sessionSalt = (round: number, session: SessionId) => round * 1000 + ['fp1', 'fp2', 'fp3', 'sprint-quali', 'sprint', 'quali', 'race'].indexOf(session) * 10;

export function playerTeamId(season: SeasonState): string {
  return getDriver(season.config.playerDriverId).teamId;
}

export function createSeason(config: SeasonConfig): SeasonState {
  const seed = normalizeSeed(config.seed);
  const rng = createRng(deriveSeed(seed, SALT.setup));
  const playerTeam = getDriver(config.playerDriverId).teamId;
  const teamForm: Record<string, number> = {};
  const reliability: Record<string, number> = {};
  const development: Record<string, Development> = {};
  for (const team of TEAMS) {
    teamForm[team.id] = 0;
    // New power-unit projects start out more fragile.
    const fragile = team.id === 'cadillac' || team.id === 'audi' ? 0.12 : 0;
    reliability[team.id] = Math.min(0.9, Math.max(0.15, rng.range(0.35, 0.75) - fragile));
    development[team.id] =
      team.id === playerTeam
        ? { ...ZERO_DEV }
        : { pace: rng.range(0.3, 0.75), tyres: rng.range(0.2, 0.7), pitCrew: rng.range(0.2, 0.7), reliability: rng.range(0.2, 0.7) };
  }
  return {
    version: 1,
    config: { ...config, seed },
    phase: 'testing',
    testing: { days: [], development: { ...ZERO_DEV } },
    teamDevelopment: development,
    teamForm,
    reliability,
    round: 1,
    weekend: null,
    results: [],
    news: [],
  };
}

// ---------- Effects ----------

function failureRiskPerLap(teamRel: number, dev: number, laps: number): number {
  const level = Math.min(1, teamRel + 0.45 * dev);
  return (FAILURES_PER_RACE * (1.6 - 1.2 * level)) / laps;
}

/**
 * Car effects for every driver in a session: team development (testing plus in-season form),
 * the player's weekend preparation and, in races, reliability and saved tyre sets.
 */
export function sessionEffects(season: SeasonState, kind: 'practice' | 'quali' | 'race', laps = 57): Record<string, CarEffects> {
  const out: Record<string, CarEffects> = {};
  const weekend = season.weekend;
  for (const driver of DRIVERS) {
    const dev = season.teamDevelopment[driver.teamId] ?? ZERO_DEV;
    const base = developmentEffects(dev);
    const effect: CarEffects = { pace: base.pace + (season.teamForm[driver.teamId] ?? 0) };
    if (kind === 'race') {
      effect.wear = base.wear;
      effect.pit = base.pit;
      effect.failureRisk = failureRiskPerLap(season.reliability[driver.teamId] ?? 0.5, dev.reliability, laps);
    }
    if (driver.id === season.config.playerDriverId && weekend && kind !== 'practice') {
      const prep = preparationEffects(weekend.prep, kind);
      effect.pace = (effect.pace ?? 0) + prep.pace;
      if (kind === 'race') effect.wear = (effect.wear ?? 1) * prep.wear;
    }
    out[driver.id] = effect;
  }
  return out;
}

function context(season: SeasonState, kind: 'practice' | 'quali' | 'race', salt: number): SessionContext {
  const circuit = season.phase === 'testing' ? TESTING_CIRCUIT : getCircuit(season.weekend!.circuitId);
  return {
    circuit,
    difficulty: season.config.difficulty,
    playerDriverId: season.config.playerDriverId,
    effects: sessionEffects(season, kind),
    seed: deriveSeed(season.config.seed, salt),
  };
}

// ---------- Testing ----------

export function nextTestDay(season: SeasonState) {
  return season.phase === 'testing' ? TEST_DAYS[season.testing.days.length] ?? null : null;
}

export function runTesting(season: SeasonState, programme: TestProgramme): SeasonState {
  const slot = nextTestDay(season);
  if (!slot) return season;
  const ctx = context(season, 'practice', SALT.testing + season.testing.days.length);
  const { day, development } = runTestDay(ctx, slot.test, slot.day, programme, season.testing.development);
  return {
    ...season,
    testing: { days: [...season.testing.days, day], development },
    teamDevelopment: { ...season.teamDevelopment, [playerTeamId(season)]: development },
  };
}

/** Ends testing (any unused days are lost) and opens round 1. */
export function finishTesting(season: SeasonState): SeasonState {
  if (season.phase !== 'testing') return season;
  return openWeekend({ ...season, phase: 'weekend', round: 1 });
}

// ---------- Weekends ----------

function openWeekend(season: SeasonState): SeasonState {
  const circuit = CIRCUITS[season.round - 1];
  const sessions = weekendSessions(circuit);
  const rng = createRng(deriveSeed(season.config.seed, SALT.weekend + season.round));
  const weekend: WeekendState = {
    round: season.round,
    circuitId: circuit.id,
    sessions,
    next: 0,
    weather: generateWeekendWeather(rng, circuit, sessions),
    prep: { setup: 0, tyres: 0, quali: 0 },
    practice: [],
    qualifying: {},
  };
  return { ...season, weekend };
}

export function currentSession(season: SeasonState): SessionId | null {
  const w = season.weekend;
  if (season.phase !== 'weekend' || !w) return null;
  return w.sessions[w.next] ?? null;
}

export function runPracticeSession(season: SeasonState, programme: PracticeProgramme): SeasonState {
  const session = currentSession(season);
  const weekend = season.weekend;
  if (!weekend || (session !== 'fp1' && session !== 'fp2' && session !== 'fp3')) return season;
  const ctx = context(season, 'practice', SALT.practice + sessionSalt(weekend.round, session));
  const { result, prep } = runPractice(ctx, session, programme, weekend.weather[session]!, weekend.prep);
  return { ...season, weekend: { ...weekend, prep, practice: [...weekend.practice, result], next: weekend.next + 1 } };
}

/** Creates the qualifying session state (segment wetness) when it is about to start. */
export function ensureQualifying(season: SeasonState): SeasonState {
  const session = currentSession(season);
  const weekend = season.weekend;
  if (!weekend || (session !== 'quali' && session !== 'sprint-quali') || weekend.qualifying[session]) return season;
  const q = createQualifying(session, weekend.weather[session]!, deriveSeed(season.config.seed, SALT.quali + sessionSalt(weekend.round, session)));
  return { ...season, weekend: { ...weekend, qualifying: { ...weekend.qualifying, [session]: q } } };
}

export function playerInQualifying(season: SeasonState, session: QualiSessionId): boolean {
  const q = season.weekend?.qualifying[session];
  if (!q) return true;
  return !q.segments.some((s) => s.eliminated.includes(season.config.playerDriverId));
}

/**
 * Runs the next qualifying segment with the player's choice. Once the player is knocked out
 * (or after Q3) the rest of the session is completed and the weekend moves on.
 */
export function runQualifying(season: SeasonState, choice: QualiChoice | null): SeasonState {
  const ready = ensureQualifying(season);
  const session = currentSession(ready);
  const weekend = ready.weekend;
  if (!weekend || (session !== 'quali' && session !== 'sprint-quali')) return ready;
  let q = weekend.qualifying[session]!;
  const salt = SALT.quali + sessionSalt(weekend.round, session) + 1 + q.segments.length;
  const ctx = context(ready, 'quali', salt);
  q = runQualifyingSegment(q, ctx, playerInQualifying(ready, session) ? choice : null);
  let next = weekend.next;
  if (q.grid) next += 1;
  return { ...ready, weekend: { ...weekend, qualifying: { ...weekend.qualifying, [session]: q }, next } };
}

/** Runs every remaining segment without the player (after a knock-out). */
export function completeQualifying(season: SeasonState): SeasonState {
  let s = season;
  for (let i = 0; i < 3; i++) {
    const session = currentSession(s);
    if (session !== 'quali' && session !== 'sprint-quali') break;
    s = runQualifying(s, null);
  }
  return s;
}

/** Grid for a Sprint or Grand Prix (from the matching qualifying session). */
export function gridFor(season: SeasonState, session: 'sprint' | 'race'): string[] | null {
  const q = season.weekend?.qualifying[session === 'sprint' ? 'sprint-quali' : 'quali'];
  return q?.grid ?? null;
}

/** Seed of a Sprint or Grand Prix (kept in the range players can type in). */
export function raceSeedFor(season: SeasonState, round: number, session: 'sprint' | 'race'): number {
  return (deriveSeed(season.config.seed, SALT.race + sessionSalt(round, session)) % 999999999) + 1;
}

/** Race configuration for the current Sprint or Grand Prix. */
export function raceConfigFor(season: SeasonState, startCompound: CompoundId): RaceConfig | null {
  const session = currentSession(season);
  const weekend = season.weekend;
  if (!weekend || (session !== 'sprint' && session !== 'race')) return null;
  const grid = gridFor(season, session);
  if (!grid) return null;
  const circuit = getCircuit(weekend.circuitId);
  const laps = session === 'sprint' ? circuit.sprintLaps ?? Math.ceil(100 / circuit.lengthKm) : circuit.laps;
  const effects = sessionEffects(season, 'race', laps);
  const saved = weekend.qualifying.quali?.savedSoftSets ?? 0;
  if (session === 'race' && saved > 0) {
    const id = season.config.playerDriverId;
    effects[id] = { ...effects[id], extraSets: { soft: saved } };
  }
  return {
    circuitId: weekend.circuitId,
    playerDriverId: season.config.playerDriverId,
    laps,
    startCompound,
    weather: weekend.weather[session]!.scenario,
    difficulty: season.config.difficulty,
    seed: raceSeedFor(season, weekend.round, session),
    scenario: 'none',
    session,
    grid,
    carEffects: effects,
    seasonRound: weekend.round,
  };
}

/** The team strategist's call for the player's car: follow the best projected plan at standard pace. */
export function strategistDecision(state: RaceState): PlayerDecision {
  const car = getPlayerCar(state);
  const outlook = car.status === 'running' ? evaluateStrategies(state, car.id) : null;
  const box = !!outlook?.best.boxNow && state.lap + 1 < state.totalLaps;
  return { pace: 'standard', box, compound: box ? outlook!.best.stops[0].compound : car.tyre.compound, boost: false };
}

/** Runs a whole race with the strategist in charge of the player's car. */
export function simulateWithStrategist(state: RaceState): RaceState {
  let current = state;
  for (let guard = 0; current.phase === 'running' && guard < 100; guard++) current = advanceLap(current, strategistDecision(current));
  return current;
}

export function pointsFor(session: 'sprint' | 'race', position: number): number {
  const table = session === 'sprint' ? SPRINT_POINTS : RACE_POINTS;
  return table[position - 1] ?? 0;
}

/** Converts a finished race into championship results. */
export function raceResultFrom(state: RaceState, simulated: boolean): RaceResult {
  const session = state.config.session ?? 'race';
  const rows: ResultRow[] = (state.classification ?? []).map((entry) => {
    const car = state.cars.find((c) => c.id === entry.carId)!;
    return {
      driverId: car.driverId,
      teamId: car.teamId,
      position: entry.position,
      status: entry.status,
      points: entry.status === 'finished' ? pointsFor(session, entry.position) : 0,
      gap: entry.gapToWinner,
      lapsDown: entry.lapsDown,
      pitStops: entry.pitStops,
      grid: car.gridPosition,
      reason: car.retiredReason ?? undefined,
    };
  });
  let fastest: string | null = null;
  let best = Infinity;
  for (const car of state.cars) {
    if (car.bestLapTime !== null && car.bestLapTime < best) {
      best = car.bestLapTime;
      fastest = car.driverId;
    }
  }
  return { session, rows, fastestLapDriverId: fastest, playerRating: simulated ? null : rateStrategy(state).score, simulated };
}

/**
 * Stores a finished Sprint or Grand Prix. After the Grand Prix the round is closed, the teams
 * develop their cars and the next weekend opens (or the season ends).
 */
export function recordRace(season: SeasonState, state: RaceState, simulated = false): SeasonState {
  const session = currentSession(season);
  const weekend = season.weekend;
  if (
    !weekend ||
    (session !== 'sprint' && session !== 'race') ||
    state.phase !== 'finished' ||
    state.config.seasonRound !== weekend.round ||
    (state.config.session ?? 'race') !== session ||
    state.config.seed !== raceSeedFor(season, weekend.round, session) ||
    state.config.playerDriverId !== season.config.playerDriverId
  )
    return season;
  const result = raceResultFrom(state, simulated);
  if (session === 'sprint') return { ...season, weekend: { ...weekend, sprint: result, next: weekend.next + 1 } };

  const round: RoundResult = {
    round: weekend.round,
    circuitId: weekend.circuitId,
    poleDriverId: weekend.qualifying.quali?.grid?.[0] ?? null,
    sprint: weekend.sprint,
    race: result,
  };
  const closed: SeasonState = { ...season, weekend: { ...weekend, race: result, next: weekend.next + 1 }, results: [...season.results, round] };
  return advanceRound(closed);
}

/** In-season development: every team's form drifts a little after each round. */
function advanceRound(season: SeasonState): SeasonState {
  const rng = createRng(deriveSeed(season.config.seed, SALT.form + season.round));
  const teamForm = { ...season.teamForm };
  const news: string[] = [];
  for (const team of TEAMS) {
    const step = rng.normal(-0.005, 0.035);
    teamForm[team.id] = Math.max(-0.3, Math.min(0.3, (teamForm[team.id] ?? 0) + step));
    if (step < -0.05) news.push(`${team.name} bring an upgrade that works: about ${Math.abs(step).toFixed(2)} s a lap quicker.`);
    else if (step > 0.05) news.push(`${team.name} struggle with their latest parts and lose about ${step.toFixed(2)} s a lap.`);
  }
  const nextRound = season.round + 1;
  if (nextRound > CIRCUITS.length) return { ...season, teamForm, news, phase: 'finished', round: CIRCUITS.length, weekend: null };
  return openWeekend({ ...season, teamForm, news, round: nextRound });
}

// ---------- Standings ----------

function compareCountback(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  for (let pos = 1; pos <= DRIVERS.length; pos++) {
    const ca = a.finishes.filter((p) => p === pos).length;
    const cb = b.finishes.filter((p) => p === pos).length;
    if (ca !== cb) return cb - ca;
  }
  return 0;
}

function build(ids: string[], key: (row: ResultRow) => string, results: RoundResult[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(ids.map((id) => [id, { id, points: 0, wins: 0, podiums: 0, finishes: [], position: 0 }]));
  for (const round of results) {
    for (const r of [round.sprint, round.race]) {
      if (!r) continue;
      for (const row of r.rows) {
        const s = rows.get(key(row));
        if (!s) continue;
        s.points += row.points;
        if (r.session === 'race' && row.status === 'finished') {
          s.finishes.push(row.position);
          if (row.position === 1) s.wins += 1;
          if (row.position <= 3) s.podiums += 1;
        }
      }
    }
  }
  const sorted = [...rows.values()].sort((a, b) => compareCountback(a, b) || ids.indexOf(a.id) - ids.indexOf(b.id));
  sorted.forEach((row, i) => {
    row.position = i + 1;
  });
  return sorted;
}

/** Drivers' championship (points from Sprints and Grands Prix; ties broken by Grand Prix results). */
export function driverStandings(season: SeasonState): StandingRow[] {
  return build(
    DRIVERS.map((d) => d.id),
    (row) => row.driverId,
    season.results,
  );
}

/** Constructors' championship: both cars score. */
export function constructorStandings(season: SeasonState): StandingRow[] {
  return build(
    TEAMS.map((t) => t.id),
    (row) => row.teamId,
    season.results,
  );
}

export function isValidSeasonConfig(config: Partial<SeasonConfig> | null | undefined): config is SeasonConfig {
  return (
    !!config &&
    isDriverId(config.playerDriverId) &&
    (config.difficulty === 'easy' || config.difficulty === 'normal' || config.difficulty === 'hard') &&
    typeof config.seed === 'number' &&
    Number.isInteger(config.seed) &&
    config.seed >= 1 &&
    config.seed <= 999999999
  );
}
