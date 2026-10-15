/**
 * Team Principal career: pre-season testing, then every round of the 2026 calendar with its
 * practice, (Sprint) qualifying, Sprint and Grand Prix sessions, for both cars of your team.
 * Between sessions you run the factory: design new parts, upgrade facilities and keep the
 * budget and the cost cap in check. Pure functions: every update returns a new season state.
 */
import { RACE_POINTS, SPRINT_POINTS } from '../constants';
import { CIRCUITS, TESTING_CIRCUIT, getCircuit } from '../data/circuits';
import { BASE_TEAMS, DRIVERS, TEAMS, driversOfTeam, getDriver, getTeam } from '../data/teams';
import { advanceLap, getManagedCars, getPlayerCar } from '../engine';
import { STAT_LABEL, allInitialStats, type CarStat } from '../manager/carStats';
import { CUSTOM_TEAM_ID, activateCustomTeam, customReliability, customTeamProblems } from '../manager/customTeam';
import {
  FACILITIES,
  MAX_FACILITY_LEVEL,
  PARTS,
  addDays,
  applyGains,
  designDays,
  expectedPoints,
  facilityUpgrade,
  initialFacilities,
  maxProjects,
  pitCrewBonus,
  rivalDevelopment,
  teamTier,
  upgradeGains,
  type FacilityId,
  type PartId,
} from '../manager/development';
import { COST_CAP, CRASH_REPAIR, OBJECTIVE_LABEL, RUNNING_COST, createSponsors, financeProfile, formatMoney, objectiveMet, post, prizeMoney } from '../manager/finance';
import { SETUP_PARAMS, baselineSetup, idealSetup, readSetup, setupPace, setupQuality, suggestedSetup, type SetupValues } from '../manager/setup';
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
  InboxMessage,
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
  { test: 1, day: 1, date: '2026-02-11' },
  { test: 1, day: 2, date: '2026-02-12' },
  { test: 1, day: 3, date: '2026-02-13' },
  { test: 2, day: 1, date: '2026-02-18' },
  { test: 2, day: 2, date: '2026-02-19' },
  { test: 2, day: 3, date: '2026-02-20' },
];

/** The career starts at the factory two days before the first test. */
export const CAREER_START = '2026-02-09';

const ZERO_DEV: Development = { pace: 0, tyres: 0, pitCrew: 0, reliability: 0 };

/** Expected mechanical retirements per car per race at average reliability. */
const FAILURES_PER_RACE = 0.05;
/** Extra operating cost of a Sprint weekend (millions). */
const SPRINT_COST = 1;
/** Rival development rate by difficulty. */
const RIVAL_PACE = { easy: 0.75, normal: 1, hard: 1.3 } as const;

// Salts keep every random stream independent of the others.
const SALT = {
  setup: 11,
  sponsors: 13,
  testing: 101,
  weekend: 211,
  practice: 307,
  quali: 401,
  race: 503,
  rivals: 601,
  parts: 701,
  aiSetup: 907,
  baseline: 1103,
};

const sessionSalt = (round: number, session: SessionId) => round * 1000 + ['fp1', 'fp2', 'fp3', 'sprint-quali', 'sprint', 'quali', 'race'].indexOf(session) * 10;

/** Formats an ISO date as "11 Feb". */
export function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

export function playerTeamId(season: SeasonState): string {
  return season.config.teamId;
}

/** Both drivers of a team, in grid order (the first is the lead car in the race screens). */
export function teamDrivers(teamId: string): string[] {
  return driversOfTeam(teamId).map((d) => d.id);
}

export function managedDrivers(season: SeasonState): string[] {
  return teamDrivers(season.config.teamId);
}

export function leadDriverId(season: SeasonState): string {
  return managedDrivers(season)[0];
}

/**
 * The board's expectation: where the car's pace says the team should finish, give or take one
 * place (and never last).
 */
export function boardTarget(carPace: number, field: ReadonlyArray<{ carPace: number }>): number {
  const rank = field.filter((t) => t.carPace < carPace).length + 1;
  return Math.min(field.length - 1, rank + 1);
}

export function boardTargetFor(teamId: string): number {
  return boardTarget(getTeam(teamId).carPace, TEAMS);
}

function message(season: SeasonState, from: string, title: string, body: string, tone: InboxMessage['tone']): SeasonState {
  const msg: InboxMessage = { id: season.nextId, date: season.date, from, title, body, tone, read: false };
  return { ...season, inbox: [msg, ...season.inbox].slice(0, 80), nextId: season.nextId + 1 };
}

export function unreadCount(season: SeasonState): number {
  return season.inbox.filter((m) => !m.read).length;
}

/** Marks one message (or all of them) as read. */
export function markRead(season: SeasonState, id?: number): SeasonState {
  if (!season.inbox.some((m) => !m.read && (id === undefined || m.id === id))) return season;
  return { ...season, inbox: season.inbox.map((m) => (id === undefined || m.id === id ? { ...m, read: true } : m)) };
}

/**
 * Starts a career. A team of your own (teamId 'custom') joins the grid as the twelfth team for
 * as long as this career is played.
 */
export function createSeason(input: SeasonConfig): SeasonState {
  const custom = input.teamId === CUSTOM_TEAM_ID ? input.customTeam ?? null : null;
  activateCustomTeam(custom);
  const config: SeasonConfig = custom ? { ...input, customTeam: custom } : { teamId: input.teamId, difficulty: input.difficulty, seed: input.seed };
  const seed = normalizeSeed(config.seed);
  const rng = createRng(deriveSeed(seed, SALT.setup));
  const teamId = config.teamId;
  const reliability: Record<string, number> = {};
  const development: Record<string, Development> = {};
  for (const team of TEAMS) {
    // New power-unit projects start out more fragile.
    const fragile = team.id === 'cadillac' || team.id === 'audi' ? 0.12 : 0;
    const roll = rng.range(0.35, 0.75) - fragile;
    const base = custom && team.id === CUSTOM_TEAM_ID ? customReliability(custom) + (roll - 0.55) * 0.3 : roll;
    reliability[team.id] = Math.min(0.9, Math.max(0.15, base));
    development[team.id] =
      team.id === teamId
        ? { ...ZERO_DEV }
        : { pace: rng.range(0.3, 0.75), tyres: rng.range(0.2, 0.7), pitCrew: rng.range(0.2, 0.7), reliability: rng.range(0.2, 0.7) };
  }
  const profile = financeProfile(teamId);
  const sponsors = createSponsors(teamId, createRng(deriveSeed(seed, SALT.sponsors)));
  const team = getTeam(teamId);
  const target = boardTargetFor(teamId);
  let season: SeasonState = {
    version: 2,
    config: { ...config, seed },
    phase: 'testing',
    testing: { days: [], development: { ...ZERO_DEV } },
    teamDevelopment: development,
    carStats: allInitialStats(),
    date: CAREER_START,
    projects: [],
    upgrades: [],
    facilities: initialFacilities(teamId),
    finance: { balance: profile.balance, capSpent: 0, ledger: [] },
    sponsors,
    inbox: [],
    nextId: 1,
    reliability,
    round: 1,
    weekend: null,
    results: [],
    news: [],
    boardTarget: target,
  };
  const [first, second] = teamDrivers(teamId).map((id) => getDriver(id).name);
  season = message(
    season,
    'Commercial department',
    'Your partners for 2026',
    season.sponsors.map((s) => `${s.name}: ${formatMoney(s.perRace)} a race, plus ${formatMoney(s.bonus)} each time we ${OBJECTIVE_LABEL[s.objective].toLowerCase()}.`).join(' '),
    'info',
  );
  season = message(
    season,
    'The board',
    `Welcome to ${team.name}, Team Principal`,
    `You run both cars: ${first} and ${second}. We expect P${target} or better in the constructors' championship. ` +
      `You have ${formatMoney(profile.balance)} in the bank and the ${formatMoney(COST_CAP)} cost cap to respect. ` +
      'Spend wisely between new parts, which count towards the cap, and the factory, which does not.',
    'info',
  );
  return season;
}

// ---------- Calendar and the factory ----------

/**
 * Moves the calendar on. Parts and facility upgrades that are ready by then arrive, with a
 * message from the technical director.
 */
export function advanceDate(season: SeasonState, to: string): SeasonState {
  if (to <= season.date) return season;
  let s: SeasonState = { ...season, date: to };
  const teamId = s.config.teamId;
  const ready = s.projects.filter((p) => p.ready <= to).sort((a, b) => a.ready.localeCompare(b.ready) || a.id - b.id);
  if (ready.length) {
    let stats = s.carStats[teamId];
    const upgrades = [...s.upgrades];
    for (const p of ready) {
      const rng = createRng(deriveSeed(s.config.seed, SALT.parts + p.id * 13));
      const gains = upgradeGains(p.part, stats, s.facilities, rng);
      stats = applyGains(stats, gains);
      upgrades.push({ part: p.part, date: p.ready, round: s.round, gains });
      const total = Object.values(gains).reduce((sum, g) => sum + (g ?? 0), 0);
      const good = total >= expectedPoints(p.part, s.facilities) * 0.55;
      const detail = (Object.entries(gains) as Array<[CarStat, number]>)
        .map(([stat, g]) => `${STAT_LABEL[stat]} ${g >= 0 ? '+' : ''}${g.toFixed(1)}`)
        .join(', ');
      s = { ...s, date: p.ready };
      s = message(
        s,
        'Technical director',
        `New ${PARTS[p.part].name.toLowerCase()} ${good ? 'delivers' : 'disappoints'}`,
        `${good ? 'The new part matches the wind tunnel.' : 'The track data does not match the wind tunnel.'} ${detail}.`,
        good ? 'good' : 'bad',
      );
    }
    s = { ...s, date: to, carStats: { ...s.carStats, [teamId]: stats }, upgrades, projects: s.projects.filter((p) => p.ready > to) };
  }
  for (const id of Object.keys(s.facilities) as FacilityId[]) {
    const f = s.facilities[id];
    if (f.upgradeReady && f.upgradeReady <= to) {
      s = { ...s, facilities: { ...s.facilities, [id]: { level: f.level + 1 } } };
      s = message(s, 'Operations', `${FACILITIES[id].name} upgraded to level ${f.level + 1}`, `${FACILITIES[id].effect}.`, 'good');
    }
  }
  return s;
}

/**
 * Cost-cap money left for development once the operating costs of the remaining weekends are
 * set aside.
 */
export function capHeadroom(season: SeasonState): number {
  const left = CIRCUITS.slice(season.results.length);
  const committed = left.reduce((sum, c) => sum + RUNNING_COST + (c.sprint ? SPRINT_COST : 0), 0);
  return Math.round((COST_CAP - season.finance.capSpent - committed) * 10) / 10;
}

export function projectCost(part: PartId): number {
  return PARTS[part].cost;
}

/** Why a part cannot be started now, or null when it can. */
export function projectBlocker(season: SeasonState, part: PartId): string | null {
  if (season.phase === 'finished') return 'The season is over.';
  if (season.projects.some((p) => p.part === part)) return 'Already in development.';
  if (season.projects.length >= maxProjects(season.facilities)) return `The factory can run ${maxProjects(season.facilities)} projects at once.`;
  const cost = projectCost(part);
  if (cost > season.finance.balance) return 'Not enough money in the bank.';
  if (cost > capHeadroom(season)) return 'It would break the cost cap.';
  return null;
}

export function startProject(season: SeasonState, part: PartId): SeasonState {
  if (projectBlocker(season, part)) return season;
  const cost = projectCost(part);
  const ready = addDays(season.date, designDays(part, season.facilities));
  return {
    ...season,
    projects: [...season.projects, { id: season.nextId, part, started: season.date, ready, cost }],
    nextId: season.nextId + 1,
    finance: post(season.finance, { date: season.date, label: `${PARTS[part].name} design and build`, amount: -cost, capped: true }),
  };
}

/** Why a facility cannot be upgraded now, or null when it can. */
export function facilityBlocker(season: SeasonState, id: FacilityId): string | null {
  const f = season.facilities[id];
  if (season.phase === 'finished') return 'The season is over.';
  if (f.level >= MAX_FACILITY_LEVEL) return 'Already at the top level.';
  if (f.upgradeReady) return `Building work until ${formatDate(f.upgradeReady)}.`;
  if (facilityUpgrade(f.level).cost > season.finance.balance) return 'Not enough money in the bank.';
  return null;
}

export function upgradeFacility(season: SeasonState, id: FacilityId): SeasonState {
  if (facilityBlocker(season, id)) return season;
  const f = season.facilities[id];
  const { cost, days } = facilityUpgrade(f.level);
  return {
    ...season,
    facilities: { ...season.facilities, [id]: { ...f, upgradeReady: addDays(season.date, days) } },
    finance: post(season.finance, { date: season.date, label: `${FACILITIES[id].name} upgrade`, amount: -cost, capped: false }),
  };
}

// ---------- Effects ----------

function failureRiskPerLap(teamRel: number, dev: number, laps: number): number {
  const level = Math.min(1, teamRel + 0.45 * dev);
  return (FAILURES_PER_RACE * (1.6 - 1.2 * level)) / laps;
}

/** The ideal setup for one of your drivers at this weekend's circuit (hidden from the player). */
export function idealFor(season: SeasonState, driverId: string): SetupValues {
  return idealSetup(getCircuit(season.weekend!.circuitId), driverId, season.config.seed);
}

/** Setup quality of rival cars: decent, never perfect, a little better at the big teams. */
function aiSetupQuality(season: SeasonState, driverId: string, round: number): number {
  const rng = createRng(deriveSeed(season.config.seed, SALT.aiSetup + round * 50 + DRIVERS.findIndex((d) => d.id === driverId)));
  return rng.range(0.66, 0.86) + (teamTier(getDriver(driverId).teamId) === 'top' ? 0.04 : 0);
}

/** How close a car's setup is to the ideal this weekend (0–1). */
export function setupQualityFor(season: SeasonState, driverId: string): number {
  const weekend = season.weekend;
  if (!weekend) return 0.75;
  const mine = weekend.setups[driverId];
  return mine ? setupQuality(mine.values, idealFor(season, driverId)) : aiSetupQuality(season, driverId, weekend.round);
}

/**
 * Car effects for every driver in a session: pre-season development, the setup and, for your
 * cars, the weekend preparation, pit-crew training and, in races, reliability and saved tyres.
 */
export function sessionEffects(season: SeasonState, kind: 'practice' | 'quali' | 'race', laps = 57): Record<string, CarEffects> {
  const out: Record<string, CarEffects> = {};
  const weekend = season.phase === 'weekend' ? season.weekend : null;
  const teamId = season.config.teamId;
  for (const driver of DRIVERS) {
    const dev = season.teamDevelopment[driver.teamId] ?? ZERO_DEV;
    const base = developmentEffects(dev);
    const effect: CarEffects = { pace: base.pace + (weekend ? setupPace(setupQualityFor(season, driver.id)) : 0) };
    if (kind === 'race') {
      effect.wear = base.wear;
      effect.pit = base.pit + (driver.teamId === teamId ? pitCrewBonus(season.facilities) : 0);
      effect.failureRisk = failureRiskPerLap(season.reliability[driver.teamId] ?? 0.5, dev.reliability, laps);
    }
    if (driver.teamId === teamId && weekend && kind !== 'practice') {
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
    playerDriverId: leadDriverId(season),
    managedDriverIds: managedDrivers(season),
    carStats: season.carStats,
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
  const dated = advanceDate(season, slot.date);
  const ctx = context(dated, 'practice', SALT.testing + season.testing.days.length);
  const { day, development } = runTestDay(ctx, slot.test, slot.day, programme, dated.testing.development);
  return {
    ...dated,
    testing: { days: [...dated.testing.days, day], development },
    teamDevelopment: { ...dated.teamDevelopment, [dated.config.teamId]: development },
  };
}

/** Ends testing (any unused days are lost) and opens round 1. */
export function finishTesting(season: SeasonState): SeasonState {
  if (season.phase !== 'testing') return season;
  return openWeekend({ ...season, phase: 'weekend', round: 1 });
}

// ---------- Weekends ----------

/** Setup knowledge at the start of a weekend, from the simulator work at the factory. */
export function simulatorKnowledge(level: number): number {
  return Math.round((0.1 + 0.06 * level) * 100) / 100;
}

function openWeekend(season: SeasonState): SeasonState {
  const circuit = CIRCUITS[season.round - 1];
  const s = advanceDate(season, addDays(circuit.raceDate, -2));
  const sessions = weekendSessions(circuit);
  const rng = createRng(deriveSeed(s.config.seed, SALT.weekend + s.round));
  const sim = s.facilities.simulator.level;
  const setups: WeekendState['setups'] = {};
  managedDrivers(s).forEach((id, i) => {
    const ideal = idealSetup(circuit, id, s.config.seed);
    setups[id] = { values: baselineSetup(ideal, sim, deriveSeed(s.config.seed, SALT.baseline + s.round * 10 + i)), tested: null, feedback: null };
  });
  const weekend: WeekendState = {
    round: s.round,
    circuitId: circuit.id,
    sessions,
    next: 0,
    weather: generateWeekendWeather(rng, circuit, sessions),
    prep: { setup: simulatorKnowledge(sim), tyres: 0, quali: 0 },
    setups,
    practice: [],
    qualifying: {},
  };
  return { ...s, weekend };
}

export function currentSession(season: SeasonState): SessionId | null {
  const w = season.weekend;
  if (season.phase !== 'weekend' || !w) return null;
  return w.sessions[w.next] ?? null;
}

/** Setups are locked (parc fermé) once the first qualifying session of the weekend has begun. */
export function setupLocked(season: SeasonState): boolean {
  const w = season.weekend;
  if (season.phase !== 'weekend' || !w) return true;
  const first = w.sessions.findIndex((id) => id === 'sprint-quali' || id === 'quali');
  if (w.next > first) return true;
  const q = w.qualifying[w.sessions[first] as QualiSessionId];
  return w.next === first && !!q && q.segments.length > 0;
}

const clampSetting = (v: number) => Math.round(Math.min(100, Math.max(0, Number.isFinite(v) ? v : 50)));

/** Changes one of your cars' setups (ignored under parc fermé). */
export function changeSetup(season: SeasonState, driverId: string, values: Partial<SetupValues>): SeasonState {
  const w = season.weekend;
  const current = w?.setups[driverId];
  if (!w || !current || setupLocked(season)) return season;
  const next = { ...current.values };
  for (const p of SETUP_PARAMS) if (values[p] !== undefined) next[p] = clampSetting(values[p]!);
  return { ...season, weekend: { ...w, setups: { ...w.setups, [driverId]: { ...current, values: next } } } };
}

/** The engineers' proposal from the driver's latest feedback, or null before any running. */
export function engineerProposal(season: SeasonState, driverId: string): SetupValues | null {
  const setup = season.weekend?.setups[driverId];
  if (!setup?.tested || !setup.feedback) return null;
  return suggestedSetup(setup.tested, setup.feedback);
}

export function runPracticeSession(season: SeasonState, programme: PracticeProgramme): SeasonState {
  const session = currentSession(season);
  const weekend = season.weekend;
  if (!weekend || (session !== 'fp1' && session !== 'fp2' && session !== 'fp3')) return season;
  const salt = SALT.practice + sessionSalt(weekend.round, session);
  const ctx = context(season, 'practice', salt);
  const weather = weekend.weather[session]!;
  const { result, prep } = runPractice(ctx, session, programme, weather, weekend.prep);
  // Each driver reports on the setup they ran; a wet track tells you little about a dry setup.
  const knowledge = weather.wetness > 0.35 ? prep.setup * 0.5 : prep.setup;
  const setups = { ...weekend.setups };
  const feedback: NonNullable<typeof result.feedback> = {};
  managedDrivers(season).forEach((id, i) => {
    const setup = setups[id];
    if (!setup) return;
    const fb = readSetup(setup.values, idealFor(season, id), knowledge, deriveSeed(season.config.seed, salt + 5 + i));
    feedback[id] = fb;
    setups[id] = { ...setup, tested: { ...setup.values }, feedback: fb };
  });
  return {
    ...season,
    weekend: { ...weekend, prep, setups, practice: [...weekend.practice, { ...result, feedback }], next: weekend.next + 1 },
  };
}

/** Creates the qualifying session state (segment wetness) when it is about to start. */
export function ensureQualifying(season: SeasonState): SeasonState {
  const session = currentSession(season);
  const weekend = season.weekend;
  if (!weekend || (session !== 'quali' && session !== 'sprint-quali') || weekend.qualifying[session]) return season;
  const q = createQualifying(session, weekend.weather[session]!, deriveSeed(season.config.seed, SALT.quali + sessionSalt(weekend.round, session)));
  return { ...season, weekend: { ...weekend, qualifying: { ...weekend.qualifying, [session]: q } } };
}

/** Your drivers still running in a qualifying session. */
export function managedInQualifying(season: SeasonState, session: QualiSessionId): string[] {
  const q = season.weekend?.qualifying[session];
  const ids = managedDrivers(season);
  if (!q) return ids;
  return ids.filter((id) => !q.segments.some((s) => s.eliminated.includes(id)));
}

/**
 * Runs the next qualifying segment with your choices for each car still in the session.
 * After Q3 (or SQ3) the grid is set and the weekend moves on.
 */
export function runQualifying(season: SeasonState, choices: Record<string, QualiChoice> | null): SeasonState {
  const ready = ensureQualifying(season);
  const session = currentSession(ready);
  const weekend = ready.weekend;
  if (!weekend || (session !== 'quali' && session !== 'sprint-quali')) return ready;
  let q = weekend.qualifying[session]!;
  const salt = SALT.quali + sessionSalt(weekend.round, session) + 1 + q.segments.length;
  const ctx = context(ready, 'quali', salt);
  q = runQualifyingSegment(q, ctx, choices);
  let next = weekend.next;
  if (q.grid) next += 1;
  return { ...ready, weekend: { ...weekend, qualifying: { ...weekend.qualifying, [session]: q }, next } };
}

/** Runs every remaining segment with the strategist's choices (after both cars are out). */
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

/** Race distance of the current Sprint or Grand Prix. */
export function raceLaps(circuitId: string, session: 'sprint' | 'race'): number {
  const circuit = getCircuit(circuitId);
  return session === 'sprint' ? circuit.sprintLaps ?? Math.ceil(100 / circuit.lengthKm) : circuit.laps;
}

/**
 * Race configuration for the current Sprint or Grand Prix, with both of your cars. The start
 * tyre can be one compound for both or one per driver.
 */
export function raceConfigFor(season: SeasonState, start: CompoundId | Record<string, CompoundId>): RaceConfig | null {
  const session = currentSession(season);
  const weekend = season.weekend;
  if (!weekend || (session !== 'sprint' && session !== 'race')) return null;
  const grid = gridFor(season, session);
  if (!grid) return null;
  const laps = raceLaps(weekend.circuitId, session);
  const effects = sessionEffects(season, 'race', laps);
  const ids = managedDrivers(season);
  const startCompounds = Object.fromEntries(ids.map((id) => [id, typeof start === 'string' ? start : start[id] ?? 'medium'])) as Record<string, CompoundId>;
  if (session === 'race') {
    for (const id of ids) {
      const saved = weekend.qualifying.quali?.savedSoftSets[id] ?? 0;
      if (saved > 0) effects[id] = { ...effects[id], extraSets: { soft: saved } };
    }
  }
  return {
    circuitId: weekend.circuitId,
    playerDriverId: ids[0],
    managedDriverIds: ids,
    startCompounds,
    laps,
    startCompound: startCompounds[ids[0]],
    weather: weekend.weather[session]!.scenario,
    difficulty: season.config.difficulty,
    seed: raceSeedFor(season, weekend.round, session),
    scenario: 'none',
    session,
    grid,
    carEffects: effects,
    seasonRound: weekend.round,
    carStats: season.carStats,
  };
}

/** The team strategist's call for one of your cars: follow the best projected plan at standard pace. */
export function strategistDecision(state: RaceState, carId?: string): PlayerDecision {
  const car = carId ? state.cars.find((c) => c.id === carId)! : getPlayerCar(state);
  const outlook = car.status === 'running' ? evaluateStrategies(state, car.id) : null;
  const box = !!outlook?.best.boxNow && state.lap + 1 < state.totalLaps;
  return { pace: 'standard', box, compound: box ? outlook!.best.stops[0].compound : car.tyre.compound, boost: false };
}

/** Runs a whole race with the strategist in charge of both of your cars. */
export function simulateWithStrategist(state: RaceState): RaceState {
  let current = state;
  for (let guard = 0; current.phase === 'running' && guard < 120; guard++) {
    const decisions = Object.fromEntries(getManagedCars(current).map((car) => [car.id, strategistDecision(current, car.id)]));
    current = advanceLap(current, decisions);
  }
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
  let rating: number | null = null;
  if (!simulated) {
    const scores = getManagedCars(state).map((car) => rateStrategy(state, car.id).score);
    rating = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }
  return { session, rows, fastestLapDriverId: fastest, playerRating: rating, simulated };
}

/**
 * Stores a finished Sprint or Grand Prix. After the Grand Prix the weekend's money is settled,
 * the round is closed, every team develops its car and the next weekend opens (or the season ends).
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
    state.config.playerDriverId !== leadDriverId(season)
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
  return advanceRound(settleWeekend(closed, round));
}

const positionText = (row: ResultRow | undefined) => (!row ? '–' : row.status === 'retired' ? 'DNF' : `P${row.position}`);

/** Money from the weekend: partners, prize fund, operating costs, salaries, repairs and bonuses. */
function settleWeekend(season: SeasonState, round: RoundResult): SeasonState {
  const circuit = getCircuit(round.circuitId);
  const teamId = season.config.teamId;
  const ids = managedDrivers(season);
  let s: SeasonState = { ...season, date: circuit.raceDate };
  let finance = s.finance;
  const date = circuit.raceDate;
  const profile = financeProfile(teamId);
  const position = constructorStandings(s).find((r) => r.id === teamId)!.position;
  finance = post(finance, { date, label: 'Partner payments', amount: s.sponsors.reduce((sum, sp) => sum + sp.perRace, 0), capped: false });
  finance = post(finance, { date, label: `Prize fund instalment (P${position})`, amount: Math.round((prizeMoney(position) / CIRCUITS.length) * 10) / 10, capped: false });
  finance = post(finance, { date, label: `${circuit.grandPrix} operations`, amount: -(RUNNING_COST + (circuit.sprint ? SPRINT_COST : 0)), capped: true });
  finance = post(finance, { date, label: 'Salaries', amount: -profile.salaries, capped: false });
  const crashes = [round.sprint, round.race].flatMap((r) => r?.rows.filter((row) => ids.includes(row.driverId) && row.reason?.startsWith('Crashed')) ?? []);
  for (const row of crashes) finance = post(finance, { date, label: `Crash repairs, ${getDriver(row.driverId).code}`, amount: -CRASH_REPAIR, capped: true });
  s = { ...s, finance };

  const rows = ids.map((id) => round.race.rows.find((r) => r.driverId === id));
  const positions = rows.map((r) => (r && r.status === 'finished' ? r.position : null));
  const bonuses: string[] = [];
  for (const sponsor of s.sponsors) {
    if (!objectiveMet(sponsor.objective, { positions })) continue;
    s = { ...s, finance: post(s.finance, { date, label: `${sponsor.name} bonus`, amount: sponsor.bonus, capped: false }) };
    bonuses.push(`${sponsor.name} pays a ${formatMoney(sponsor.bonus)} bonus (${OBJECTIVE_LABEL[sponsor.objective].toLowerCase()}).`);
  }
  const points = [round.sprint, round.race].reduce((sum, r) => sum + (r?.rows.filter((row) => row.teamId === teamId).reduce((a, row) => a + row.points, 0) ?? 0), 0);
  const names = ids.map((id, i) => `${getDriver(id).name} ${positionText(rows[i])}`).join(', ');
  s = message(
    s,
    'Sporting director',
    `${circuit.grandPrix}: ${rows.map(positionText).join(' and ')}`,
    `${names}. ${points > 0 ? `${points} points for the team this weekend.` : 'No points this weekend.'} ${crashes.length ? `Crash repairs cost ${formatMoney(crashes.length * CRASH_REPAIR)}.` : ''} ${bonuses.join(' ')}`.trim(),
    points >= 10 ? 'good' : points > 0 ? 'info' : 'bad',
  );
  return s;
}

/** Rival development between rounds and the next weekend (or the end of the season). */
function advanceRound(season: SeasonState): SeasonState {
  const rng = createRng(deriveSeed(season.config.seed, SALT.rivals + season.round));
  const carStats = { ...season.carStats };
  const news: string[] = [];
  const rate = RIVAL_PACE[season.config.difficulty];
  for (const team of TEAMS) {
    if (team.id === season.config.teamId) continue;
    const { gains, total } = rivalDevelopment(team.id, carStats[team.id], rng);
    const scaled = Object.fromEntries(Object.entries(gains).map(([k, v]) => [k, (v ?? 0) * (total > 0 ? rate : 1)]));
    carStats[team.id] = applyGains(carStats[team.id], scaled);
    if (total * rate > 2.3) news.push(`${team.name} bring a big upgrade package (${Object.keys(gains).map((k) => STAT_LABEL[k as CarStat].toLowerCase()).join(', ')}).`);
    else if (total < 0) news.push(`${team.name} struggle with their latest parts and go backwards.`);
  }
  const updated: SeasonState = { ...season, carStats, news };
  const nextRound = season.round + 1;
  if (nextRound > CIRCUITS.length) return endSeason({ ...updated, phase: 'finished', round: CIRCUITS.length, weekend: null });
  return openWeekend({ ...updated, round: nextRound });
}

function endSeason(season: SeasonState): SeasonState {
  const teamId = season.config.teamId;
  const position = constructorStandings(season).find((r) => r.id === teamId)!.position;
  const met = position <= season.boardTarget;
  return message(
    { ...season, projects: [] },
    'The board',
    met ? `Target met: P${position} in the constructors' championship` : `Target missed: P${position} in the constructors' championship`,
    met
      ? `We asked for P${season.boardTarget} or better and you delivered. The board looks forward to next year.`
      : `We asked for P${season.boardTarget} or better. The board expects a stronger campaign next year.`,
    met ? 'good' : 'bad',
  );
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
    typeof config.teamId === 'string' &&
    (config.teamId === CUSTOM_TEAM_ID ? customTeamProblems(config.customTeam).length === 0 : BASE_TEAMS.some((t) => t.id === config.teamId)) &&
    (config.difficulty === 'easy' || config.difficulty === 'normal' || config.difficulty === 'hard') &&
    typeof config.seed === 'number' &&
    Number.isInteger(config.seed) &&
    config.seed >= 1 &&
    config.seed <= 999999999
  );
}
