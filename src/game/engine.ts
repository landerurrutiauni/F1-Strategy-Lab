import { chooseStartCompound, decideAi, drawStintOffset, fallbackCompound, type Neighbours } from './ai';
import { classify } from './classification';
import {
  BASE_ERROR_CHANCE,
  BATTERY_RECHARGE,
  BATTERY_RECHARGE_SC,
  BOOST_ATTACK_BONUS,
  BOOST_COST,
  BOOST_DEFEND_BONUS,
  CRASH_SHARE_DRY,
  CRASH_SHARE_MISMATCH,
  DIFFICULTIES,
  DIRTY_AIR_PENALTY,
  DIRTY_AIR_WINDOW,
  ERROR_MAX_LOSS,
  ERROR_MIN_LOSS,
  ERROR_WEAR,
  FAILURE_TIME_LOSS,
  FAST_STOP_CHANCE,
  FAST_STOP_GAIN,
  FOLLOW_GAP_MAX,
  FOLLOW_GAP_MIN,
  GRID_SPACING,
  MAX_WEAR,
  OVERTAKE_SPREAD,
  OVERTAKE_TIME_COST,
  PACE_MODES,
  PIT_STATIONARY_MEAN,
  PIT_STATIONARY_SD,
  SC_CLOSE_RATE,
  SC_MAX_LAPS,
  SC_MIN_LAPS,
  SC_PIT_FACTOR,
  SC_TRAIN_GAP,
  SLOW_STOP_CHANCE,
  SLOW_STOP_MAX,
  SLOW_STOP_MIN,
  MAX_RACE_LAPS,
  MIN_RACE_LAPS,
} from './constants';
import { CIRCUITS, getCircuit } from './data/circuits';
import { COMPOUNDS, COMPOUND_ORDER, isCompoundId } from './data/tyres';
import { DRIVERS, getDriver, getTeam, isDriverId } from './data/teams';
import { carPaceOffset, computeLapTime, safetyCarLapTime, wearSmoothness } from './lapTime';
import { evaluateStrategies, planLabel, tracePlan } from './projection';
import { createRng, normalizeSeed } from './rng';
import { circuitWear, expectedWear, failureChance, fastestCompoundFor, suitabilityGap } from './tyreModel';
import { buildForecast, generateWeatherTimeline, initialWetness, nextWetness, rainLabel } from './weather';
import type {
  CarState,
  CompoundId,
  DecisionRecord,
  EventSeverity,
  PaceMode,
  PlayerDecision,
  RaceConfig,
  RaceEvent,
  RaceEventKind,
  RaceState,
} from './types';

export class RaceEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RaceEngineError';
  }
}

const VALID_WEATHER = ['dry', 'variable', 'rainy'];
const VALID_DIFFICULTY = ['easy', 'normal', 'hard'];
const VALID_PACE: PaceMode[] = ['conserve', 'standard', 'push'];
const VALID_SCENARIOS = ['none', 'safety-car-early', 'safety-car-late', 'storm', 'drying'];

/** Returns a list of human-readable problems with a race configuration (empty when valid). */
export function validateConfig(config: Partial<RaceConfig> | null | undefined): string[] {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') return ['Race configuration is missing.'];
  if (!CIRCUITS.some((c) => c.id === config.circuitId)) errors.push('Choose a circuit.');
  if (!isDriverId(config.playerDriverId)) errors.push('Choose the driver you will run strategy for.');
  if (config.managedDriverIds !== undefined) {
    const ids = config.managedDriverIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => !isDriverId(id)) || !ids.includes(config.playerDriverId as string))
      errors.push('The cars you manage must include your lead driver.');
  }
  if (config.session !== undefined && config.session !== 'race' && config.session !== 'sprint') errors.push('Unknown session.');
  if (typeof config.laps !== 'number' || !Number.isInteger(config.laps) || config.laps < MIN_RACE_LAPS || config.laps > MAX_RACE_LAPS)
    errors.push(`Race distance must be between ${MIN_RACE_LAPS} and ${MAX_RACE_LAPS} laps.`);
  if (config.grid !== undefined) {
    const ids = new Set(config.grid);
    if (!Array.isArray(config.grid) || config.grid.length !== DRIVERS.length || ids.size !== DRIVERS.length || DRIVERS.some((d) => !ids.has(d.id)))
      errors.push('The starting grid must list every driver once.');
  }
  if (!isCompoundId(config.startCompound)) errors.push('Choose a starting tyre.');
  if (!VALID_WEATHER.includes(config.weather as string)) errors.push('Choose a weather scenario.');
  if (!VALID_DIFFICULTY.includes(config.difficulty as string)) errors.push('Choose a difficulty.');
  if (typeof config.seed !== 'number' || !Number.isFinite(config.seed) || config.seed < 1 || config.seed > 999999999)
    errors.push('Race seed must be a whole number between 1 and 999999999.');
  if (config.scenario !== undefined && !VALID_SCENARIOS.includes(config.scenario)) errors.push('Unknown scenario.');
  return errors;
}

/** Category of tyre that suits a wetness level. */
function conditionCategory(wetness: number): 'slick' | 'inter' | 'wet' {
  const fastest = fastestCompoundFor(wetness);
  return fastest === 'inter' ? 'inter' : fastest === 'wet' ? 'wet' : 'slick';
}

function pushEvent(
  state: RaceState,
  lap: number,
  kind: RaceEventKind,
  severity: EventSeverity,
  title: string,
  detail: string,
  extra: Partial<Pick<RaceEvent, 'carId' | 'major' | 'radio'>> = {},
) {
  state.events.push({ id: state.nextEventId++, lap, kind, severity, title, detail, ...extra });
}

/** Drivers whose strategy the player runs (one car, or both cars of a team). */
export function managedDriverIds(config: Pick<RaceConfig, 'playerDriverId' | 'managedDriverIds'>): string[] {
  return config.managedDriverIds?.length ? config.managedDriverIds : [config.playerDriverId];
}

/** Name of a managed car's race engineer (the voice on the radio); the lead car by default. */
export function playerEngineer(state: RaceState, carId?: string): string {
  const car = carId ? state.cars.find((c) => c.id === carId) : undefined;
  return getDriver(car?.driverId ?? state.config.playerDriverId).engineer;
}

const code = (car: CarState) => getDriver(car.driverId).code;
const fmt = (seconds: number) => `${seconds.toFixed(1)} s`;

/** Running cars by track order, then retired cars. */
export function orderCars(cars: CarState[]): CarState[] {
  const running = cars.filter((c) => c.status === 'running').sort((a, b) => a.elapsed - b.elapsed);
  const retired = cars
    .filter((c) => c.status === 'retired')
    .sort((a, b) => b.lapsCompleted - a.lapsCompleted || (b.retiredLap ?? 0) - (a.retiredLap ?? 0));
  return [...running, ...retired];
}

function assignPositions(state: RaceState) {
  orderCars(state.cars).forEach((car, i) => {
    car.position = i + 1;
  });
}

/** The lead managed car. */
export function getPlayerCar(state: RaceState): CarState {
  const car = state.cars.find((c) => c.driverId === state.config.playerDriverId) ?? state.cars.find((c) => c.isPlayer);
  if (!car) throw new RaceEngineError('Player car missing from race state.');
  return car;
}

/** Every car the player manages, lead car first. */
export function getManagedCars(state: RaceState): CarState[] {
  const lead = getPlayerCar(state);
  return [lead, ...state.cars.filter((c) => c.isPlayer && c.id !== lead.id)];
}

export function createRace(config: RaceConfig): RaceState {
  const errors = validateConfig(config);
  if (errors.length > 0) throw new RaceEngineError(errors.join(' '));

  const seed = normalizeSeed(config.seed);
  const circuit = getCircuit(config.circuitId);
  const rng = createRng(seed);
  const scenario = config.scenario ?? 'none';
  const laps = config.laps;

  const weatherTimeline = generateWeatherTimeline(rng, laps, config.weather, circuit, scenario);

  let debrisSafetyCarLap: number | null = null;
  if (scenario === 'safety-car-early') debrisSafetyCarLap = 3;
  else if (scenario === 'safety-car-late') debrisSafetyCarLap = laps - 4;
  else if (rng.chance(circuit.safetyCarChance * 0.75)) debrisSafetyCarLap = rng.int(2, laps - 3);

  let temperatureShiftLap: number | null = null;
  let temperatureShift = 0;
  if (config.weather !== 'rainy' && rng.chance(0.4)) {
    temperatureShiftLap = rng.int(Math.round(laps * 0.35), Math.round(laps * 0.7));
    temperatureShift = rng.pick([-6, -4, 5, 7]);
  }

  const wetness = initialWetness(weatherTimeline);

  // The grid comes from a qualifying session when given; otherwise car + driver pace plus a
  // little variation decides it.
  const effects = config.carEffects ?? {};
  const managed = new Set(managedDriverIds(config));
  const quali = config.grid
    ? config.grid.map((id) => ({ driver: getDriver(id), isPlayer: managed.has(id) }))
    : DRIVERS.map((driver) => {
        const isPlayer = managed.has(driver.id);
        const offset = carPaceOffset({ teamId: driver.teamId, driverId: driver.id, isPlayer, paceBonus: effects[driver.id]?.pace }, config.difficulty);
        return { driver, isPlayer, time: offset + rng.normal(0, 0.22) };
      }).sort((a, b) => a.time - b.time);

  const cars: CarState[] = quali.map(({ driver, isPlayer }, index) => {
    const team = getTeam(driver.teamId);
    const ownStart = config.startCompounds?.[driver.id];
    const compound: CompoundId = isPlayer
      ? ownStart && isCompoundId(ownStart)
        ? ownStart
        : config.startCompound
      : chooseStartCompound(team.profile, wetness, laps, rng);
    const allocation = Object.fromEntries(COMPOUND_ORDER.map((c) => [c, COMPOUNDS[c].allocation])) as Record<
      CompoundId,
      number
    >;
    allocation[compound] -= 1;
    const car: CarState = {
      id: driver.id,
      driverId: driver.id,
      teamId: team.id,
      isPlayer,
      profile: isPlayer ? 'player' : team.profile,
      gridPosition: index + 1,
      position: index + 1,
      elapsed: index * GRID_SPACING,
      lapsCompleted: 0,
      tyre: { compound, wear: 0, age: 0 },
      stints: [{ compound, startLap: 1, endLap: null, laps: 0, endWear: 0 }],
      pitStops: [],
      allocation,
      usedCompounds: [compound],
      pace: 'standard',
      battery: 100,
      status: 'running',
      retiredLap: null,
      retiredReason: null,
      laps: [],
      lastLapTime: null,
      bestLapTime: null,
      plannedPitLap: null,
      plannedCompound: null,
      aiNeedsPlan: !isPlayer,
      aiStintOffset: 0,
      mistakes: 0,
      tyreFailures: 0,
      penaltyTime: 0,
    };
    const effect = effects[driver.id];
    if (effect?.pace) car.paceBonus = effect.pace;
    if (effect?.wear && effect.wear !== 1) car.wearFactor = effect.wear;
    if (effect?.pit) car.pitBonus = effect.pit;
    if (effect?.failureRisk) car.failureRisk = effect.failureRisk;
    for (const [c, n] of Object.entries(effect?.extraSets ?? {})) {
      if (isCompoundId(c) && typeof n === 'number' && n > 0) car.allocation[c] += Math.floor(n);
    }
    car.aiStintOffset = drawStintOffset(car, rng, config.difficulty);
    return car;
  });

  const trackTemp = Math.round(circuit.trackTemp - 12 * weatherTimeline[1] + rng.normal(0, 1.2));

  const state: RaceState = {
    version: 1,
    config: { ...config, seed, scenario },
    rngState: rng.state,
    lap: 0,
    totalLaps: laps,
    phase: 'running',
    cars,
    weather: { rain: weatherTimeline[1], wetness, trackTemp },
    weatherTimeline,
    forecast: buildForecast(weatherTimeline, seed, 0, laps, config.weather),
    safetyCar: { active: false, lapsRemaining: 0, deployedAfterLap: null, reason: null, deployments: 0 },
    scheduled: { debrisSafetyCarLap, temperatureShiftLap, temperatureShift },
    events: [],
    nextEventId: 1,
    decisionLog: [],
    lapStatus: [null],
    wetnessHistory: [wetness],
    classification: null,
    preRaceProjection: 0,
    preRacePlanElapsed: [],
    preRacePlanLabel: '',
  };

  assignPositions(state);
  const player = getPlayerCar(state);
  pushEvent(
    state,
    0,
    'start',
    'info',
    `Lights out at ${circuit.name}`,
    `${laps} laps. ${getDriver(player.driverId).name} starts P${player.gridPosition} on ${COMPOUNDS[player.tyre.compound].name} tyres.`,
    { radio: `Radio check. Lights out in ten seconds. Plan as discussed, we start on ${COMPOUNDS[player.tyre.compound].name.toLowerCase()}s.` },
  );
  if (wetness >= 0.08) {
    pushEvent(state, 0, 'weather', 'warning', `${rainLabel(state.weather.rain)} at the start`, 'The track is wet. Check that your tyres suit the conditions.', { major: true });
  }

  state.preRacePlans = {};
  for (const car of getManagedCars(state)) {
    const outlook = evaluateStrategies(state, car.id);
    if (!outlook) continue;
    const trace = tracePlan(state, car.id, outlook.best.stops);
    state.preRacePlans[car.id] = trace;
    if (car.id === player.id) {
      state.preRaceProjection = outlook.best.totalTime;
      state.preRacePlanElapsed = trace;
      state.preRacePlanLabel = planLabel(outlook.best.stops);
    }
  }
  return state;
}

/** Keep the current pace and tyres (the lead car unless another managed car is given). */
export function defaultDecision(state: RaceState, carId?: string): PlayerDecision {
  const car = carId ? state.cars.find((c) => c.id === carId) : state.cars.find((c) => c.driverId === state.config.playerDriverId) ?? state.cars.find((c) => c.isPlayer);
  return { pace: car?.pace ?? 'standard', box: false, compound: car?.tyre.compound ?? 'medium', boost: false };
}

/** Decisions for the managed cars, keyed by car id. A single decision applies to the lead car. */
export type DecisionInput = PlayerDecision | Record<string, PlayerDecision>;

function isSingleDecision(input: DecisionInput): input is PlayerDecision {
  return typeof (input as PlayerDecision).pace === 'string';
}

/** One decision per managed car; cars without one keep their pace and stay out. */
export function decisionsFor(state: RaceState, input: DecisionInput): Record<string, PlayerDecision> {
  const lead = getPlayerCar(state);
  const given: Record<string, PlayerDecision> = isSingleDecision(input) ? { [lead.id]: input } : input;
  const out: Record<string, PlayerDecision> = {};
  for (const car of getManagedCars(state)) out[car.id] = given[car.id] ?? defaultDecision(state, car.id);
  return out;
}

/** Returns a reason the decision is invalid, or null when it can be applied (lead car unless `carId` is given). */
export function validateDecision(state: RaceState, decision: PlayerDecision, carId?: string): string | null {
  if (state.phase !== 'running') return 'The race has finished.';
  const car = carId ? state.cars.find((c) => c.id === carId) ?? getPlayerCar(state) : getPlayerCar(state);
  if (car.status !== 'running') return null; // decisions are ignored once retired
  if (!VALID_PACE.includes(decision.pace)) return 'Unknown pace mode.';
  if (!isCompoundId(decision.compound)) return 'Unknown tyre compound.';
  if (decision.box) {
    if (state.lap + 1 >= state.totalLaps) return 'This is the final lap: a pit stop would only lose time.';
    if (car.allocation[decision.compound] <= 0) return `No fresh ${COMPOUNDS[decision.compound].name} sets left.`;
  }
  if (decision.boost) {
    if (state.safetyCar.active) return 'Boost is unavailable behind the Safety Car.';
    if (car.battery < BOOST_COST) return 'Not enough energy for a boost.';
  }
  return null;
}

interface LapWork {
  car: CarState;
  decision: PlayerDecision;
  start: number;
  raw: number;
  pitTime: number;
  finish: number;
  wearGain: number;
  boost: boolean;
  pitNote?: string;
  stationary: number;
  laneLoss: number;
  forcedPit: boolean;
  passed: boolean;
}

function logistic(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function recordPlayerDecision(state: RaceState, decision: PlayerDecision, player: CarState): DecisionRecord | null {
  if (player.status !== 'running') return null;
  const outlook = evaluateStrategies(state, player.id);
  if (!outlook) return null;
  const chosen = decision.box
    ? outlook.plans.find((p) => p.boxNow && p.stops[0].compound === decision.compound) ?? outlook.bestBoxNow
    : outlook.bestStayOut;
  const alternative = decision.box ? outlook.bestStayOut : outlook.bestBoxNow;
  const chosenTime = chosen?.totalTime ?? outlook.best.totalTime;
  return {
    lap: state.lap + 1,
    carId: player.id,
    decision: { ...decision },
    regret: Math.max(0, chosenTime - outlook.best.totalTime),
    gainVsAlternative: alternative ? alternative.totalTime - chosenTime : 0,
    bestPlanLabel: planLabel(outlook.best.stops),
    alternativeLabel: alternative ? planLabel(alternative.stops) : '',
    safetyCar: state.safetyCar.active,
    wetness: state.weather.wetness,
    tyreMismatch: suitabilityGap(player.tyre.compound, state.weather.wetness),
    wearAtStart: player.tyre.wear,
    compound: player.tyre.compound,
  };
}

/**
 * Simulates the next lap. Pure: returns a new state and never mutates the input.
 * `decision` applies to the player's car for the upcoming lap; boxing means the car
 * pits at the end of that lap and starts the following lap on the new set.
 */
export function advanceLap(previous: RaceState, input: DecisionInput): RaceState {
  const given = decisionsFor(previous, input);
  for (const [carId, decision] of Object.entries(given)) {
    const problem = validateDecision(previous, decision, carId);
    if (problem) throw new RaceEngineError(problem);
  }
  const decisionRecords = getManagedCars(previous)
    .map((car) => recordPlayerDecision(previous, given[car.id], car))
    .filter((r): r is DecisionRecord => r !== null);
  const state: RaceState = structuredClone(previous);
  const rng = createRng(state.rngState);
  const circuit = getCircuit(state.config.circuitId);
  const difficulty = DIFFICULTIES[state.config.difficulty];
  const lap = state.lap + 1;
  const sc = state.safetyCar.active;
  const wetness = state.weather.wetness;
  const trackTemp = state.weather.trackTemp;
  const player = getPlayerCar(state);
  // With both cars of a team the feed names the driver instead of saying "you".
  const team = state.cars.filter((c) => c.isPlayer).length > 1;
  state.decisionLog.push(...decisionRecords);

  const roadOrder = state.cars.filter((c) => c.status === 'running').sort((a, b) => a.elapsed - b.elapsed);
  const prevPositions = new Map(state.cars.map((c) => [c.id, c.position]));

  // 1. Decisions for every running car (player decision is given; rivals decide now).
  const decisions = new Map<string, PlayerDecision>();
  roadOrder.forEach((car, index) => {
    if (car.isPlayer) {
      decisions.set(car.id, { ...given[car.id] });
      return;
    }
    const neighbours: Neighbours = {
      intervalAhead: index > 0 ? car.elapsed - roadOrder[index - 1].elapsed : null,
      intervalBehind: index < roadOrder.length - 1 ? roadOrder[index + 1].elapsed - car.elapsed : null,
    };
    const result = decideAi(state, car, rng, neighbours);
    car.plannedPitLap = result.plannedPitLap;
    car.plannedCompound = result.plannedCompound;
    car.aiNeedsPlan = false;
    decisions.set(car.id, result.decision);
  });

  // 2. Raw lap for each car: lap-time model, variation, mistakes, failures and pit stops.
  let crashThisLap: CarState | null = null;
  const work: LapWork[] = roadOrder.map((car) => {
    const d = decisions.get(car.id)!;
    car.pace = sc ? car.pace : d.pace;
    const driver = getDriver(car.driverId);
    const fresh = car.tyre.age === 0 && car.pitStops.length > 0;
    const boost = !sc && d.boost && car.battery >= BOOST_COST;
    const pace: PaceMode = sc ? 'standard' : d.pace;
    let raw = sc
      ? safetyCarLapTime(circuit, wetness) + rng.normal(0, 0.08)
      : computeLapTime({
          circuit,
          lapNumber: lap,
          wetness,
          tyre: car.tyre,
          pace,
          carOffset: carPaceOffset(car, state.config.difficulty),
          boost,
          freshFromPit: fresh,
        }).total + rng.normal(0, driver.consistency * (1 + 0.5 * wetness));

    let wearGain =
      expectedWear({
        compound: car.tyre.compound,
        pace,
        degradation: circuitWear(circuit),
        wetness,
        trackTemp,
        safetyCar: sc,
        smoothness: wearSmoothness(car),
      }) * rng.range(0.94, 1.06);

    let box = d.box && lap < state.totalLaps;
    let compound = d.compound;
    let forcedPit = false;

    // Tyre failure risk on very worn tyres.
    if (!sc && rng.chance(failureChance(car.tyre.wear))) {
      raw += FAILURE_TIME_LOSS;
      car.tyreFailures += 1;
      if (lap < state.totalLaps) {
        forcedPit = !box;
        box = true;
        if (forcedPit || car.allocation[compound] <= 0) compound = fallbackCompound(car, wetness, state.totalLaps - lap);
      }
      pushEvent(
        state,
        lap,
        'tyre',
        car.isPlayer ? 'danger' : 'warning',
        `${code(car)} tyre failure`,
        `${COMPOUNDS[car.tyre.compound].name} tyre gave up at ${Math.round(car.tyre.wear)}% wear. About ${FAILURE_TIME_LOSS} s lost limping back${lap < state.totalLaps ? ' for a forced stop' : ''}.`,
        { carId: car.id, major: car.isPlayer || car.position <= 3, radio: car.isPlayer ? 'Puncture, puncture. Bring it back to the pits carefully, we are ready for you.' : undefined },
      );
    }

    // Mechanical failures only exist in season mode, where pre-season mileage improves reliability.
    if (car.failureRisk && rng.chance(car.failureRisk)) {
      const failure = rng.pick(['Power unit failure', 'Gearbox failure', 'Hydraulics problem', 'Brake-by-wire fault', 'Energy store fault']);
      car.status = 'retired';
      car.retiredLap = lap;
      car.retiredReason = failure;
      pushEvent(
        state,
        lap,
        'incident',
        car.isPlayer ? 'danger' : 'warning',
        `${code(car)} retires`,
        `${failure} for ${getDriver(car.driverId).name}.`,
        { carId: car.id, major: car.isPlayer || car.position <= 5, radio: car.isPlayer ? 'We have to stop the car. Box, box. Sorry, nothing you could do.' : undefined },
      );
    }

    // Driver mistakes: more likely when pushing, on worn tyres and on the wrong tyre for the conditions.
    const mismatch = suitabilityGap(car.tyre.compound, wetness);
    const errorChance =
      BASE_ERROR_CHANCE *
      PACE_MODES[pace].riskMultiplier *
      driver.errorProneness *
      (car.isPlayer ? 1 : difficulty.rivalErrors) *
      (1 + Math.min(mismatch, 8) * 0.35) *
      (1 + (car.tyre.wear / 100) * 0.8) *
      (1 + wetness * 0.8) *
      (sc ? 0.2 : 1);
    if (car.status === 'running' && rng.chance(errorChance)) {
      const crashShare = mismatch > 1.5 ? CRASH_SHARE_MISMATCH : CRASH_SHARE_DRY;
      const turn = rng.int(1, circuit.corners);
      if (!sc && rng.chance(crashShare)) {
        car.status = 'retired';
        car.retiredLap = lap;
        car.retiredReason = `Crashed at turn ${turn}`;
        car.mistakes += 1;
        crashThisLap = car;
        pushEvent(
          state,
          lap,
          'incident',
          'danger',
          `${code(car)} crashes out`,
          `${getDriver(car.driverId).name} lost control at turn ${turn}${mismatch > 1.5 ? ' on tyres that did not suit the conditions' : ''}.`,
          { carId: car.id, major: true, radio: car.isPlayer ? 'Are you OK? ... OK, understood. Car is done, sorry.' : undefined },
        );
      } else {
        const loss = rng.range(ERROR_MIN_LOSS, ERROR_MAX_LOSS);
        raw += loss;
        wearGain += ERROR_WEAR;
        car.mistakes += 1;
        const nearPlayer = Math.abs(car.position - player.position) <= 2;
        if (car.isPlayer || nearPlayer || car.position === 1) {
          pushEvent(
            state,
            lap,
            'incident',
            car.isPlayer ? 'warning' : 'info',
            car.isPlayer ? `${team ? code(car) + ': mistake' : 'Mistake'} at turn ${turn}` : `${code(car)} runs wide`,
            `${car.isPlayer ? 'Lock-up and a trip over the run-off' : `${getDriver(car.driverId).name} ran wide at turn ${turn}`}: ${fmt(loss)} lost and a flat-spotted tyre.${car.isPlayer && pace === 'push' ? ' Pushing raises the risk of mistakes.' : ''}`,
            { carId: car.id, radio: car.isPlayer ? 'OK, we lost some time there. Reset and keep it clean.' : undefined },
          );
        }
      }
    }

    // Pit stop: lane loss (reduced under the Safety Car) plus the stationary service time.
    let pitTime = 0;
    let stationary = 0;
    let laneLoss = 0;
    let pitNote: string | undefined;
    if (box && car.status === 'running') {
      if (car.allocation[compound] <= 0) compound = fallbackCompound(car, wetness, state.totalLaps - lap);
      laneLoss = sc ? circuit.pitLaneLoss * SC_PIT_FACTOR : circuit.pitLaneLoss;
      stationary = Math.max(2.1 - (car.pitBonus ?? 0), rng.normal(PIT_STATIONARY_MEAN - (car.pitBonus ?? 0), PIT_STATIONARY_SD));
      const roll = rng.next();
      if (roll < SLOW_STOP_CHANCE) {
        const extra = rng.range(SLOW_STOP_MIN, SLOW_STOP_MAX);
        stationary += extra;
        pitNote = rng.pick(['Wheel-nut problem', 'Front jack slipped', 'Cross-threaded wheel nut']) + ` (+${extra.toFixed(1)} s)`;
      } else if (roll < SLOW_STOP_CHANCE + FAST_STOP_CHANCE) {
        stationary = Math.max(1.9, stationary - FAST_STOP_GAIN);
        pitNote = 'Rapid stop by the crew';
      }
      pitTime = laneLoss + stationary;
    } else {
      box = false;
    }

    return {
      car,
      decision: { ...d, box, compound },
      start: car.elapsed,
      raw,
      pitTime,
      finish: car.elapsed + raw + pitTime,
      wearGain,
      boost,
      pitNote,
      stationary,
      laneLoss,
      forcedPit,
      passed: false,
    };
  });

  const active = work.filter((w) => w.car.status === 'running');

  // 3. Traffic. Under green: overtaking needs a pace advantage that depends on the circuit.
  //    Under the Safety Car: no overtaking and the field closes up.
  if (sc) {
    const train = active.filter((w) => !w.decision.box);
    train.forEach((w, i) => {
      if (i === 0) return;
      const ahead = train[i - 1];
      const gapStart = w.start - ahead.start;
      const newGap = SC_TRAIN_GAP + Math.max(0, gapStart - SC_TRAIN_GAP) * (1 - SC_CLOSE_RATE);
      w.finish = ahead.finish + newGap;
    });
    for (const w of active.filter((x) => x.decision.box)) {
      const ahead = train.filter((t) => t.start < w.start).pop();
      if (ahead) {
        const gapStart = w.start - ahead.start;
        w.finish = ahead.finish + SC_TRAIN_GAP + Math.max(0, gapStart - SC_TRAIN_GAP) * (1 - SC_CLOSE_RATE) + w.pitTime;
      }
    }
    const sorted = [...active].sort((a, b) => a.finish - b.finish);
    for (let i = 1; i < sorted.length; i++) {
      sorted[i].finish = Math.max(sorted[i].finish, sorted[i - 1].finish + SC_TRAIN_GAP);
    }
  } else {
    const resolved: LapWork[] = [];
    for (const w of active) {
      if (!w.decision.box) {
        const blockers = resolved
          .filter((r) => !r.decision.box && r.finish > w.finish - FOLLOW_GAP_MIN)
          .sort((a, b) => b.finish - a.finish);
        for (const b of blockers) {
          // Pace advantage this lap (s): how much quicker the attacker is than the car ahead.
          const advantage = b.raw - w.raw;
          const effective = advantage + (w.boost ? BOOST_ATTACK_BONUS : 0) - (b.boost ? BOOST_DEFEND_BONUS : 0);
          const p = logistic((effective - circuit.overtakeDelta) / OVERTAKE_SPREAD);
          if (rng.chance(p)) {
            w.finish = Math.min(w.finish + OVERTAKE_TIME_COST, b.finish - 0.05);
            b.finish += OVERTAKE_TIME_COST;
            w.passed = true;
            if (w.car.isPlayer || b.car.isPlayer) {
              const playerAttacking = w.car.isPlayer;
              const teamBattle = w.car.isPlayer && b.car.isPlayer;
              pushEvent(
                state,
                lap,
                'overtake',
                teamBattle ? 'info' : playerAttacking ? 'good' : 'warning',
                team ? `${code(w.car)} passes ${code(b.car)}` : playerAttacking ? `You pass ${code(b.car)}` : `${code(w.car)} passes you`,
                playerAttacking
                  ? `A ${advantage > 0 ? advantage.toFixed(1) + ' s' : 'small'} pace advantage${w.boost ? ' and the boost' : ''} did the job.`
                  : `${getDriver(w.car.driverId).name} had the pace${w.boost ? ' and used the boost' : ''}.`,
                {
                  carId: playerAttacking ? w.car.id : b.car.id,
                  radio: teamBattle
                    ? undefined
                    : playerAttacking
                      ? `Good move. ${code(b.car)} is behind, keep pushing.`
                      : `${code(w.car)} is through. Stay with him, the race is long.`,
                },
              );
            }
          } else {
            w.finish = b.finish + rng.range(FOLLOW_GAP_MIN, FOLLOW_GAP_MAX);
            if (w.car.isPlayer && advantage > 0.25) {
              pushEvent(
                state,
                lap,
                'overtake',
                'info',
                `Stuck behind ${code(b.car)}`,
                `${team ? code(w.car) + ' was' : 'You were'} ${advantage.toFixed(1)} s quicker but could not get past. ${circuit.name} needs about ${circuit.overtakeDelta.toFixed(1)} s of pace advantage.`,
                { carId: w.car.id },
              );
            }
            break;
          }
        }
        const nearestAhead = resolved
          .filter((r) => !r.decision.box && r.finish < w.finish)
          .reduce<LapWork | null>((acc, r) => (!acc || r.finish > acc.finish ? r : acc), null);
        if (!w.passed && nearestAhead && w.finish - nearestAhead.finish < DIRTY_AIR_WINDOW) w.finish += DIRTY_AIR_PENALTY;
      }
      resolved.push(w);
    }
  }

  // 4. Commit lap results, tyre wear, energy and pit stops.
  const rivalStops: string[] = [];
  for (const w of work) {
    const car = w.car;
    if (car.status !== 'running') {
      car.stints[car.stints.length - 1].endLap = lap - 1;
      continue;
    }
    const lapTime = w.finish - w.start;
    car.elapsed = w.finish;
    car.lapsCompleted = lap;
    car.lastLapTime = lapTime;
    if (!sc && !w.decision.box && lap > 1 && (car.bestLapTime === null || lapTime < car.bestLapTime)) car.bestLapTime = lapTime;
    car.tyre.wear = Math.min(MAX_WEAR, car.tyre.wear + w.wearGain);
    car.tyre.age += 1;
    const stint = car.stints[car.stints.length - 1];
    stint.laps += 1;
    stint.endWear = car.tyre.wear;
    car.battery = Math.max(0, Math.min(100, car.battery + (w.boost ? -BOOST_COST : sc ? BATTERY_RECHARGE_SC : BATTERY_RECHARGE)));

    car.laps.push({
      lap,
      lapTime,
      elapsed: car.elapsed,
      compound: car.tyre.compound,
      wear: car.tyre.wear,
      pace: sc ? 'standard' : w.decision.pace,
      position: 0,
      pitted: w.decision.box,
      safetyCar: sc,
      wetness,
    });

    if (w.decision.box) {
      const to = w.decision.compound;
      const from = car.tyre.compound;
      stint.endLap = lap;
      car.pitStops.push({
        lap,
        from,
        to,
        wearAtStop: car.tyre.wear,
        stationaryTime: w.stationary,
        laneLoss: w.laneLoss,
        totalLoss: w.pitTime,
        underSafetyCar: sc,
        forced: w.forcedPit,
        note: w.pitNote,
      });
      car.allocation[to] -= 1;
      if (!car.usedCompounds.includes(to)) car.usedCompounds.push(to);
      car.tyre = { compound: to, wear: 0, age: 0 };
      car.stints.push({ compound: to, startLap: lap + 1, endLap: null, laps: 0, endWear: 0 });
      if (!car.isPlayer) {
        car.aiNeedsPlan = true;
        car.plannedPitLap = null;
        car.aiStintOffset = drawStintOffset(car, rng, state.config.difficulty);
      }
      if (car.isPlayer) {
        pushEvent(
          state,
          lap,
          'pit',
          w.pitNote?.startsWith('Rapid') ? 'good' : w.pitNote ? 'warning' : 'info',
          `Box, box${team ? ' ' + code(car) : ''}: ${COMPOUNDS[from].name} to ${COMPOUNDS[to].name}`,
          `Stationary ${w.stationary.toFixed(1)} s, ${fmt(w.pitTime)} total${sc ? ' under the Safety Car' : ''}.${w.pitNote ? ' ' + w.pitNote + '.' : ''}`,
          { carId: car.id, major: true, radio: `Box, box. ${COMPOUNDS[to].name}s going on.` },
        );
      } else {
        rivalStops.push(
          `${code(car)} ${COMPOUNDS[from].letter} to ${COMPOUNDS[to].letter} (${Math.round(car.pitStops[car.pitStops.length - 1].wearAtStop)}% worn${w.forcedPit ? ', forced' : ''}${w.pitNote?.includes('+') ? ', slow stop' : ''})`,
        );
      }
    }
  }
  // Rival stops are summarised in one entry per lap so the feed stays readable.
  if (rivalStops.length > 0) {
    pushEvent(
      state,
      lap,
      'pit',
      'info',
      rivalStops.length === 1 ? `${rivalStops[0].split(' ')[0]} pits` : `${rivalStops.length} rivals pit${sc ? ' under the Safety Car' : ''}`,
      rivalStops.join('; ') + '.',
    );
  }

  assignPositions(state);
  for (const car of state.cars) {
    const last = car.laps[car.laps.length - 1];
    if (last && last.lap === lap) last.position = car.position;
  }
  for (const car of state.cars) {
    if (!car.isPlayer || car.status !== 'running') continue;
    const before = prevPositions.get(car.id) ?? car.position;
    if (car.position < before && !state.events.some((e) => e.lap === lap && e.kind === 'overtake' && e.severity === 'good' && e.carId === car.id)) {
      pushEvent(state, lap, 'info', 'good', `${team ? code(car) + ' up' : 'Up'} to P${car.position}`, `Gained ${before - car.position} place${before - car.position > 1 ? 's' : ''} this lap.`, {
        carId: car.id,
      });
    }
  }

  // 5. Safety Car: count down, then deploy for crashes or scheduled debris.
  state.lapStatus[lap] = sc ? 'sc' : 'green';
  state.wetnessHistory[lap] = wetness;
  if (state.safetyCar.active) {
    state.safetyCar.lapsRemaining -= 1;
    if (state.safetyCar.lapsRemaining <= 0) {
      state.safetyCar.active = false;
      state.safetyCar.lapsRemaining = 0;
      if (lap < state.totalLaps)
        pushEvent(state, lap, 'safety-car', 'good', 'Green flag', 'The Safety Car is in. Racing resumes next lap; pit stops cost full time again.', { major: true });
    } else if (state.safetyCar.lapsRemaining === 1 && lap < state.totalLaps) {
      pushEvent(state, lap, 'safety-car', 'warning', 'Safety Car in this lap', 'Last chance for a cheaper stop before racing resumes.');
    }
  }
  const debris = state.scheduled.debrisSafetyCarLap === lap;
  if ((crashThisLap || debris) && lap < state.totalLaps) {
    const reason = crashThisLap ? `${code(crashThisLap)} stopped at the barrier` : rng.pick(['Debris on the racing line', 'A stranded car at the exit of the hairpin', 'Barrier repair needed']);
    if (state.safetyCar.active) {
      state.safetyCar.lapsRemaining = Math.max(state.safetyCar.lapsRemaining, 2);
    } else {
      const duration = rng.int(SC_MIN_LAPS, SC_MAX_LAPS);
      state.safetyCar = {
        active: true,
        lapsRemaining: duration,
        deployedAfterLap: lap,
        reason,
        deployments: state.safetyCar.deployments + 1,
      };
      const cheapLoss = circuit.pitLaneLoss * SC_PIT_FACTOR + PIT_STATIONARY_MEAN;
      pushEvent(
        state,
        lap,
        'safety-car',
        'warning',
        'Safety Car deployed',
        `${reason}. A stop now costs about ${fmt(cheapLoss)} instead of ${fmt(circuit.pitLaneLoss + PIT_STATIONARY_MEAN)}, and the field will bunch up.`,
        { major: true, radio: 'Safety Car, Safety Car. Stay off the brakes, delta positive. Your call on the box.' },
      );
      for (const car of state.cars) if (!car.isPlayer) car.aiNeedsPlan = true;
    }
  }

  // 6. Conditions for the next lap.
  if (lap < state.totalLaps) {
    const prevRain = state.weather.rain;
    const nextRain = state.weatherTimeline[lap + 1] ?? 0;
    const nextWet = nextWetness(wetness, nextRain);
    const shiftApplied = state.scheduled.temperatureShiftLap !== null && lap >= state.scheduled.temperatureShiftLap ? state.scheduled.temperatureShift : 0;
    const targetTemp = circuit.trackTemp + shiftApplied - 12 * nextRain;
    const nextTemp = Math.round(trackTemp + 0.5 * (targetTemp - trackTemp));
    if (state.scheduled.temperatureShiftLap === lap) {
      const hotter = state.scheduled.temperatureShift > 0;
      pushEvent(
        state,
        lap,
        'track',
        hotter ? 'warning' : 'info',
        hotter ? 'Track temperature rising' : 'Clouds cool the track',
        hotter
          ? `The sun is out: the track is heading for ${Math.round(targetTemp)}°C. Tyre wear will increase.`
          : `The track is cooling towards ${Math.round(targetTemp)}°C. Tyre wear will ease slightly.`,
      );
    }
    if (prevRain < 0.05 && nextRain >= 0.05) {
      pushEvent(state, lap, 'weather', 'warning', `${rainLabel(nextRain)} starts to fall`, 'Grip will drop as the track gets wetter. Watch the radar and the crossover to intermediates.', { major: true, radio: 'Rain reported in sector one. Tell us what you feel on the slicks.' });
    } else if (prevRain < 0.5 && nextRain >= 0.5) {
      pushEvent(state, lap, 'weather', 'warning', 'Rain getting heavier', 'Full wets will soon be the quicker tyre if this continues.', { major: true });
    } else if (prevRain >= 0.05 && nextRain < 0.05) {
      pushEvent(state, lap, 'weather', 'info', 'Rain has stopped', 'The track will start to dry. A dry line usually appears within a few laps.', { major: true });
    }
    const beforeCat = conditionCategory(wetness);
    const afterCat = conditionCategory(nextWet);
    if (beforeCat !== afterCat) {
      const message: Record<typeof afterCat, string> = {
        slick: 'Dry line forming: slicks are now the quicker tyre.',
        inter: 'Crossover: intermediates are now the quicker tyre.',
        wet: 'Standing water: full wets are now the quicker tyre.',
      };
      pushEvent(state, lap, 'weather', afterCat === 'slick' ? 'good' : 'warning', 'Track conditions changing', message[afterCat], {
        major: true,
        radio: afterCat === 'slick' ? 'Dry line is there. Slicks are the quicker tyre now.' : afterCat === 'inter' ? 'Inters are the tyre now. Box is open.' : 'Standing water. Full wets are the tyre.',
      });
      for (const car of state.cars) if (!car.isPlayer) car.aiNeedsPlan = true;
    }
    state.weather = { rain: nextRain, wetness: nextWet, trackTemp: nextTemp };
    state.forecast = buildForecast(state.weatherTimeline, state.config.seed, lap, state.totalLaps, state.config.weather);
  } else {
    state.forecast = [];
  }

  state.lap = lap;
  if (lap === state.totalLaps - 1 && player.status === 'running') {
    const running = getManagedCars(state).filter((c) => c.status === 'running');
    const where = team ? running.map((c) => `${code(c)} P${c.position}`).join(', ') : `P${player.position}`;
    pushEvent(state, lap, 'info', 'info', 'Final lap next', `${where} with one lap to go.`, {
      carId: player.id,
      radio: player.position === 1 ? 'Last lap. Bring it home, no risks.' : 'Final lap. Everything you have got.',
    });
  }
  if (lap >= state.totalLaps) {
    state.phase = 'finished';
    state.safetyCar.active = false;
    state.classification = classify(state);
    const winner = state.classification[0];
    const playerEntry = state.classification.find((e) => e.carId === player.id);
    for (const entry of state.classification) {
      const car = state.cars.find((c) => c.id === entry.carId);
      if (entry.penaltyTime > 0 && car?.isPlayer) {
        pushEvent(
          state,
          lap,
          'info',
          'danger',
          'Compound rule penalty',
          `${team ? code(car) + ' did' : 'You did'} not use two different dry compounds: +${entry.penaltyTime} s added to the race time.`,
          { major: true, carId: car.id },
        );
      }
    }
    const winnerCar = state.cars.find((c) => c.id === winner.carId)!;
    pushEvent(
      state,
      lap,
      'finish',
      playerEntry?.position === 1 ? 'good' : 'info',
      'Chequered flag',
      team
        ? `${getDriver(winnerCar.driverId).name} wins. ${getManagedCars(state)
            .map((c) => {
              const e = state.classification!.find((x) => x.carId === c.id);
              return `${code(c)} ${e?.status === 'finished' ? 'P' + e.position : 'DNF'}`;
            })
            .join(', ')}.`
        : playerEntry?.status === 'finished'
          ? playerEntry.position === 1
            ? 'You win the race!'
            : `${getDriver(winnerCar.driverId).name} wins. You finish P${playerEntry.position}.`
          : `${getDriver(winnerCar.driverId).name} wins. Your car did not finish.`,
      {
        major: true,
        carId: player.id,
        radio:
          playerEntry?.status !== 'finished'
            ? undefined
            : playerEntry.position === 1
              ? 'Get in there! That is the win. Great job, mate.'
              : playerEntry.position <= 3
                ? `P${playerEntry.position}, podium. Good job today.`
                : playerEntry.position <= 10
                  ? `P${playerEntry.position}. Points on the board.`
                  : `P${playerEntry.position}. Tough one. We will review it.`,
      },
    );
  }

  state.rngState = rng.state;
  return state;
}

/** Runs the remaining laps with the player's current pace and no stops (used after retirement). */
export function simulateToFinish(state: RaceState): RaceState {
  let current = state;
  let guard = 0;
  while (current.phase === 'running' && guard < 100) {
    current = advanceLap(current, defaultDecision(current));
    guard++;
  }
  return current;
}
