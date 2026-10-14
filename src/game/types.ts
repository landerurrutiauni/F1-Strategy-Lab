/**
 * Core data model for the F1 Strategy Lab race simulation.
 *
 * Units used throughout the engine:
 *  - time: seconds (number, fractional)
 *  - tyre wear: percent of usable tread life, 0 (new) to 100 (finished)
 *  - wetness / rain intensity: 0 (dry) to 1 (flooded / torrential)
 *  - temperature: degrees Celsius
 *  - laps: integers, the first racing lap is lap 1
 */

export type CompoundId = 'soft' | 'medium' | 'hard' | 'inter' | 'wet';
export type PaceMode = 'conserve' | 'standard' | 'push';
export type WeatherScenario = 'dry' | 'variable' | 'rainy';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type StrategyProfile = 'player' | 'aggressive' | 'conservative' | 'adaptive' | 'balanced';
export type RaceLength = 10 | 15 | 20;

/** Sprint distance in laps (about half of the matching Grand Prix distance). */
export type SprintLength = 5 | 8 | 10;

/** A Grand Prix or the shorter Saturday Sprint (no pit-stop compound rule, fewer points). */
export type RaceSession = 'race' | 'sprint';

/** Season-long or weekend effects on one car (from testing, practice and team development). */
export interface CarEffects {
  /** Seconds per lap added to the car's pace (negative is faster). */
  pace?: number;
  /** Multiplier on tyre wear (below 1 means gentler on the tyres). */
  wear?: number;
  /** Seconds taken off the pit crew's stationary time. */
  pit?: number;
  /** Chance per lap of a mechanical retirement (season mode only). */
  failureRisk?: number;
  /** Extra new sets for the race (e.g. a soft set saved in qualifying). */
  extraSets?: Partial<Record<CompoundId, number>>;
}

/** Optional deterministic scenarios used for testing and challenge setups. */
export type ScenarioId = 'none' | 'safety-car-early' | 'safety-car-late' | 'storm' | 'drying';

export interface CompoundSpec {
  id: CompoundId;
  name: string;
  /** Single-letter code shown on tyre badges so compounds never rely on colour alone. */
  letter: 'S' | 'M' | 'H' | 'I' | 'W';
  slick: boolean;
  /** Dry-track pace offset relative to a new soft tyre (s/lap). */
  dryPaceOffset: number;
  /** Base wear per lap (% of life) at degradation factor 1.0, standard pace, 35°C track. */
  baseWear: number;
  /** Multiplier applied to the wear-based pace penalty. */
  degSensitivity: number;
  /** Extra time on the first lap of a fresh set while it reaches temperature (s). */
  warmUpPenalty: number;
  /** Track wetness this tyre is designed for (0 dry .. 1 flooded). */
  idealWetness: number;
  /** Penalty coefficient when the track is drier than ideal (s per wetness unit squared). */
  drierPenalty: number;
  /** Penalty coefficient when the track is wetter than ideal (s per wetness unit squared). */
  wetterPenalty: number;
  /** Exponent applied to the wetness mismatch. Slicks lose grip faster than treaded tyres. */
  mismatchExponent: number;
  /** Number of fresh sets each car gets for the race. */
  allocation: number;
  colorVar: string;
}

export interface CircuitSpec {
  id: string;
  /** Round number on the 2026 calendar. */
  round: number;
  /** Official event name, e.g. "Australian Grand Prix". */
  grandPrix: string;
  /** Race-weekend dates as shown on the calendar, e.g. "06–08 Mar". */
  weekend: string;
  /** Race day (ISO date). */
  raceDate: string;
  name: string;
  fullName: string;
  region: string;
  lengthKm: number;
  corners: number;
  /** Reference dry lap on new softs with a neutral car, before fuel effect (s). */
  baseLapTime: number;
  /** Tyre degradation multiplier (1.0 = average). */
  degradation: number;
  /** Time lost driving through the pit lane versus staying on track, excluding the stationary stop (s). */
  pitLaneLoss: number;
  /** Pace advantage (s) an attacker needs for a 50% chance of a pass. */
  overtakeDelta: number;
  /** 0..1 likelihood of rain influencing the variable forecast. */
  rainPropensity: number;
  /** Typical track temperature (°C). */
  trackTemp: number;
  /** Probability of a debris / stranded-car Safety Car in a race (before driver errors). */
  safetyCarChance: number;
  summary: string;
  traits: string[];
  /** Closed track outline in a 600×400 view box, in racing direction from the start/finish line. */
  outline: Array<[number, number]>;
  sector: 'street' | 'speed' | 'abrasive' | 'flowing';
  /** Sprint weekend (Sprint Qualifying and a Sprint on Friday and Saturday). */
  sprint: boolean;
}

export interface TeamSpec {
  id: string;
  name: string;
  short: string;
  color: string;
  profile: StrategyProfile;
  /** Car pace offset (s/lap). Negative is faster. */
  carPace: number;
  /** One-line description of how the team approaches races. */
  approach: string;
}

export interface DriverSpec {
  id: string;
  teamId: string;
  name: string;
  code: string;
  number: number;
  /** Race engineer: the voice on the radio. */
  engineer: string;
  /** Driver pace offset (s/lap). Negative is faster. */
  skill: number;
  /** Standard deviation of lap-to-lap variation (s). */
  consistency: number;
  /** Multiplier on mistake probability. */
  errorProneness: number;
  /** Multiplier on tyre wear (smooth drivers < 1). */
  tyreSmoothness: number;
}

export interface TyreSet {
  compound: CompoundId;
  wear: number;
  /** Laps completed on this set. */
  age: number;
}

export interface Stint {
  compound: CompoundId;
  startLap: number;
  /** Last lap completed on this set (null while the stint is running). */
  endLap: number | null;
  laps: number;
  endWear: number;
}

export interface PitStop {
  /** The lap at the end of which the car entered the pit lane. */
  lap: number;
  from: CompoundId;
  to: CompoundId;
  wearAtStop: number;
  stationaryTime: number;
  laneLoss: number;
  totalLoss: number;
  underSafetyCar: boolean;
  forced: boolean;
  note?: string;
}

export interface LapRecord {
  lap: number;
  lapTime: number;
  elapsed: number;
  compound: CompoundId;
  /** Wear at the end of the lap (before any pit stop). */
  wear: number;
  pace: PaceMode;
  position: number;
  pitted: boolean;
  safetyCar: boolean;
  wetness: number;
}

export type CarStatus = 'running' | 'retired';

export interface CarState {
  id: string;
  driverId: string;
  teamId: string;
  isPlayer: boolean;
  profile: StrategyProfile;
  gridPosition: number;
  position: number;
  elapsed: number;
  lapsCompleted: number;
  tyre: TyreSet;
  stints: Stint[];
  pitStops: PitStop[];
  /** Fresh sets remaining per compound. */
  allocation: Record<CompoundId, number>;
  usedCompounds: CompoundId[];
  pace: PaceMode;
  /** Energy store, 0..100. */
  battery: number;
  status: CarStatus;
  retiredLap: number | null;
  retiredReason: string | null;
  laps: LapRecord[];
  lastLapTime: number | null;
  bestLapTime: number | null;
  /** AI-only: lap the team currently intends to pit on (end of lap); null = no further stop planned. */
  plannedPitLap: number | null;
  /** AI-only: compound intended for the next stop. */
  plannedCompound: CompoundId | null;
  /** AI-only: the team must (re)build its plan before the next lap. */
  aiNeedsPlan: boolean;
  /** AI-only: laps the team tends to shift its planned stop by (profile + difficulty noise). */
  aiStintOffset: number;
  mistakes: number;
  tyreFailures: number;
  /** Seconds of penalties applied at classification. */
  penaltyTime: number;
  /** Season effects (absent in quick races). */
  paceBonus?: number;
  wearFactor?: number;
  pitBonus?: number;
  failureRisk?: number;
}

export interface WeatherState {
  /** Rain intensity for the upcoming lap. */
  rain: number;
  /** Track wetness for the upcoming lap. */
  wetness: number;
  trackTemp: number;
}

export interface ForecastEntry {
  lap: number;
  /** Radar estimate of rain intensity. */
  rain: number;
  /** 0..1 confidence in the estimate (decreases with distance). */
  confidence: number;
}

export interface SafetyCarState {
  active: boolean;
  /** Laps still to be run behind the Safety Car, including the upcoming lap. */
  lapsRemaining: number;
  deployedAfterLap: number | null;
  reason: string | null;
  deployments: number;
}

export type RaceEventKind =
  | 'start'
  | 'weather'
  | 'safety-car'
  | 'pit'
  | 'incident'
  | 'overtake'
  | 'tyre'
  | 'track'
  | 'finish'
  | 'info';

export type EventSeverity = 'info' | 'good' | 'warning' | 'danger';

export interface RaceEvent {
  id: number;
  lap: number;
  kind: RaceEventKind;
  severity: EventSeverity;
  title: string;
  detail: string;
  carId?: string;
  /** Major events are highlighted in the results summary. */
  major?: boolean;
  /** Team-radio line from the player's race engineer. */
  radio?: string;
}

export interface PlayerDecision {
  pace: PaceMode;
  /** Box at the end of the upcoming lap. */
  box: boolean;
  compound: CompoundId;
  /** Deploy the overtake energy boost on the upcoming lap. */
  boost: boolean;
}

export interface RaceConfig {
  circuitId: string;
  /** The driver whose strategy the player controls. */
  playerDriverId: string;
  laps: RaceLength | SprintLength;
  startCompound: CompoundId;
  weather: WeatherScenario;
  difficulty: Difficulty;
  seed: number;
  scenario?: ScenarioId;
  /** Grand Prix (default) or Sprint. */
  session?: RaceSession;
  /** Starting order as driver ids (from qualifying). Without it a quick qualifying is simulated. */
  grid?: string[];
  /** Per-driver effects keyed by driver id. */
  carEffects?: Record<string, CarEffects>;
  /** Championship round this race belongs to (season mode). */
  seasonRound?: number;
}

export interface ScheduledEvents {
  /** Lap after which a debris Safety Car is deployed (null = none). */
  debrisSafetyCarLap: number | null;
  /** Lap after which track temperature shifts. */
  temperatureShiftLap: number | null;
  temperatureShift: number;
}

export interface DecisionRecord {
  lap: number;
  decision: PlayerDecision;
  /** Estimated seconds lost versus the best plan available at the time (≥ 0). */
  regret: number;
  /** Estimated seconds gained versus the alternative action (positive = good call). */
  gainVsAlternative: number;
  bestPlanLabel: string;
  alternativeLabel: string;
  safetyCar: boolean;
  wetness: number;
  /** Wetness-suitability penalty of the tyre the car was on versus the best compound (s). */
  tyreMismatch: number;
  wearAtStart: number;
  compound: CompoundId;
}

export interface ClassificationEntry {
  carId: string;
  position: number;
  lapsCompleted: number;
  totalTime: number;
  gapToWinner: number | null;
  lapsDown: number;
  status: 'finished' | 'retired';
  penaltyTime: number;
  pitStops: number;
  bestLap: number | null;
}

export interface RaceState {
  version: 1;
  config: RaceConfig;
  rngState: number;
  /** Laps completed by the race so far (0 before the start). */
  lap: number;
  totalLaps: number;
  phase: 'running' | 'finished';
  cars: CarState[];
  weather: WeatherState;
  /** Hidden ground truth rain intensity per lap; index 0 is unused, index n is lap n. */
  weatherTimeline: number[];
  forecast: ForecastEntry[];
  safetyCar: SafetyCarState;
  scheduled: ScheduledEvents;
  events: RaceEvent[];
  nextEventId: number;
  decisionLog: DecisionRecord[];
  /** Track status for each completed lap: index n is lap n. */
  lapStatus: Array<'green' | 'sc' | null>;
  wetnessHistory: number[];
  classification: ClassificationEntry[] | null;
  /** Projected total race time for the player at lights out (best plan). */
  preRaceProjection: number;
  /** Lap-by-lap projected elapsed time for the pre-race best plan. */
  preRacePlanElapsed: number[];
  preRacePlanLabel: string;
}

export interface LapTimeBreakdown {
  base: number;
  fuel: number;
  car: number;
  compound: number;
  degradation: number;
  weather: number;
  pace: number;
  warmUp: number;
  boost: number;
  start: number;
  total: number;
}
