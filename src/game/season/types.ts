import type { CarStats } from '../manager/carStats';
import type { Facilities, PartId } from '../manager/development';
import type { Finance, Sponsor } from '../manager/finance';
import type { DriverSetup, SetupFeedback } from '../manager/setup';
import type { CompoundId, Difficulty, WeatherScenario } from '../types';

/** Sessions of a race weekend, in running order. */
export type SessionId = 'fp1' | 'fp2' | 'fp3' | 'sprint-quali' | 'sprint' | 'quali' | 'race';
export type QualiSessionId = 'quali' | 'sprint-quali';
export type PracticeSessionId = 'fp1' | 'fp2' | 'fp3';

/** Expected conditions for one session of the weekend. */
export interface SessionWeather {
  scenario: WeatherScenario;
  /** Representative track wetness for practice and qualifying (0 dry to 1 flooded). */
  wetness: number;
}

/** One driver's best lap in a timed session. */
export interface TimedEntry {
  driverId: string;
  /** Best lap (s); null when no lap was set. */
  time: number | null;
  compound: CompoundId;
  laps: number;
  note?: string;
}

// ---------- Pre-season testing ----------

export type TestProgramme = 'aero' | 'race-sims' | 'pit-practice' | 'mileage';

/** Season-long development of the player's team, each from 0 (nothing learned) to 1. */
export interface Development {
  pace: number;
  tyres: number;
  pitCrew: number;
  reliability: number;
}

export interface TestDay {
  test: 1 | 2;
  day: 1 | 2 | 3;
  programme: TestProgramme;
  entries: TimedEntry[];
  /** What the day taught the team, for the report. */
  notes: string[];
}

export interface TestingState {
  days: TestDay[];
  development: Development;
}

// ---------- Practice ----------

export type PracticeProgramme = 'setup' | 'long-runs' | 'quali-sim';

/** Weekend preparation of the player's cars, each from 0 to 1. */
export interface Preparation {
  /** Setup knowledge: how clearly the drivers' feedback points to the ideal setup. */
  setup: number;
  /** Long runs: tyre wear in the races. */
  tyres: number;
  /** Qualifying simulations: one-lap pace. */
  quali: number;
}

export interface PracticeResult {
  session: PracticeSessionId;
  programme: PracticeProgramme;
  wetness: number;
  entries: TimedEntry[];
  notes: string[];
  /** What each of your drivers reported about the setup. */
  feedback?: Record<string, SetupFeedback>;
}

// ---------- Qualifying ----------

/** How the player's car runs a qualifying segment. */
export type QualiPlan = 'safe' | 'standard' | 'all-in';

export interface QualiChoice {
  compound: CompoundId;
  plan: QualiPlan;
}

export interface QualiSegment {
  index: 1 | 2 | 3;
  wetness: number;
  /** Everyone who took part, fastest first (no time last). */
  entries: TimedEntry[];
  /** Drivers knocked out at the end of this segment. */
  eliminated: string[];
  /** The choices for your cars that took part, by driver. */
  choices?: Record<string, QualiChoice>;
}

export interface QualifyingState {
  session: QualiSessionId;
  /** Track wetness for each segment, decided when the session starts. */
  wetness: [number, number, number];
  segments: QualiSegment[];
  /** Final grid as driver ids once the session is over. */
  grid: string[] | null;
  /** New soft sets saved for the Grand Prix by running mediums, by driver. */
  savedSoftSets: Record<string, number>;
}

// ---------- Races and the championship ----------

export interface ResultRow {
  driverId: string;
  teamId: string;
  position: number;
  status: 'finished' | 'retired';
  points: number;
  /** Gap to the winner (s) for cars on the lead lap. */
  gap: number | null;
  lapsDown: number;
  pitStops: number;
  /** Starting position. */
  grid: number;
  reason?: string;
}

export interface RaceResult {
  session: 'sprint' | 'race';
  rows: ResultRow[];
  fastestLapDriverId: string | null;
  /** The player's strategy rating (0–100, average over your cars) when the player ran the race. */
  playerRating: number | null;
  /** True when the team strategist simulated the race for the player. */
  simulated: boolean;
}

export interface WeekendState {
  round: number;
  circuitId: string;
  sessions: SessionId[];
  /** Index of the next session to run (equals sessions.length when the weekend is over). */
  next: number;
  weather: Record<SessionId, SessionWeather | undefined>;
  prep: Preparation;
  /** Setup of each of your cars for this weekend. */
  setups: Record<string, DriverSetup>;
  practice: PracticeResult[];
  qualifying: Partial<Record<QualiSessionId, QualifyingState>>;
  sprint?: RaceResult;
  race?: RaceResult;
}

export interface SeasonConfig {
  /** The team you run as Team Principal (both cars). */
  teamId: string;
  difficulty: Difficulty;
  seed: number;
}

export interface DesignProject {
  id: number;
  part: PartId;
  started: string;
  /** Date the part is designed, built and ready to race. */
  ready: string;
  cost: number;
}

export interface PartUpgrade {
  part: PartId;
  date: string;
  /** First round the part raced. */
  round: number;
  gains: Partial<CarStats>;
}

export interface InboxMessage {
  id: number;
  date: string;
  from: string;
  title: string;
  body: string;
  tone: 'good' | 'bad' | 'info';
  read: boolean;
}

/** Summary kept for every completed round. */
export interface RoundResult {
  round: number;
  circuitId: string;
  poleDriverId: string | null;
  sprint?: RaceResult;
  race: RaceResult;
}

export interface SeasonState {
  version: 2;
  config: SeasonConfig;
  phase: 'testing' | 'weekend' | 'finished';
  testing: TestingState;
  /** Pre-season development of every team (the player's team comes from testing). */
  teamDevelopment: Record<string, Development>;
  /** Current car ratings of every team (yours from your upgrades, rivals from theirs). */
  carStats: Record<string, CarStats>;
  /** Calendar date (ISO) at the team's headquarters. */
  date: string;
  projects: DesignProject[];
  upgrades: PartUpgrade[];
  facilities: Facilities;
  finance: Finance;
  sponsors: Sponsor[];
  inbox: InboxMessage[];
  nextId: number;
  /** Mechanical reliability of each team from 0 (fragile) to 1 (bulletproof). */
  reliability: Record<string, number>;
  /** Round being contested (1-based). */
  round: number;
  weekend: WeekendState | null;
  results: RoundResult[];
  /** Paddock news from the last round (upgrades that worked or failed). */
  news: string[];
  /** The board's target: this constructors' position or better. */
  boardTarget: number;
}

export type { DriverSetup };

export interface StandingRow {
  id: string;
  points: number;
  wins: number;
  podiums: number;
  /** Finishing positions in Grands Prix, used for the countback tie-break. */
  finishes: number[];
  position: number;
}
