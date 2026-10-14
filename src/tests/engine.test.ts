import { describe, expect, it } from 'vitest';
import { classify } from '../game/classification';
import { BOOST_COST, COMPOUND_RULE_PENALTY, PIT_STATIONARY_MEAN, SC_PIT_FACTOR } from '../game/constants';
import { getCircuit } from '../game/data/circuits';
import { DRIVERS } from '../game/data/teams';
import { RaceEngineError, advanceLap, createRace, defaultDecision, getPlayerCar, validateConfig, validateDecision } from '../game/engine';
import type { RaceState } from '../game/types';
import { baseConfig, runLaps, scriptedOneStop } from './helpers';

describe('race configuration', () => {
  it('creates a fully initialised race with the whole 2026 grid', () => {
    const race = createRace(baseConfig());
    expect(race.cars).toHaveLength(DRIVERS.length);
    expect(race.lap).toBe(0);
    expect(race.phase).toBe('running');
    expect(race.cars.filter((c) => c.isPlayer)).toHaveLength(1);
    expect(getPlayerCar(race).driverId).toBe('nor');
    expect(new Set(race.cars.map((c) => c.position)).size).toBe(DRIVERS.length);
    expect(getPlayerCar(race).tyre).toEqual({ compound: 'medium', wear: 0, age: 0 });
    expect(getPlayerCar(race).allocation.medium).toBe(1);
  });

  it('rejects invalid configurations', () => {
    expect(validateConfig(baseConfig())).toEqual([]);
    expect(validateConfig(baseConfig({ laps: 12 as never }))).not.toEqual([]);
    expect(validateConfig(baseConfig({ circuitId: 'atlantis' }))).not.toEqual([]);
    expect(validateConfig(baseConfig({ playerDriverId: 'nobody' }))).not.toEqual([]);
    expect(validateConfig(baseConfig({ seed: 0 }))).not.toEqual([]);
    expect(validateConfig(baseConfig({ seed: Number.NaN }))).not.toEqual([]);
    expect(validateConfig(baseConfig({ startCompound: 'slick' as never }))).not.toEqual([]);
    expect(validateConfig(null)).not.toEqual([]);
    expect(() => createRace(baseConfig({ laps: 7 as never }))).toThrow(RaceEngineError);
  });
});

describe('race progression', () => {
  it.each([10, 15, 20] as const)('advances lap by lap and finishes after %i laps', (laps) => {
    let race = createRace(baseConfig({ laps }));
    for (let i = 1; i <= laps; i++) {
      race = advanceLap(race, scriptedOneStop(Math.floor(laps / 2))(race));
      expect(race.lap).toBe(i);
    }
    expect(race.phase).toBe('finished');
    expect(race.classification).not.toBeNull();
    expect(() => advanceLap(race, defaultDecision(race))).toThrow(RaceEngineError);
    const player = getPlayerCar(race);
    if (player.status === 'running') expect(player.laps).toHaveLength(laps);
  });

  it('never mutates the previous state', () => {
    const race = createRace(baseConfig());
    const snapshot = JSON.stringify(race);
    advanceLap(race, { pace: 'push', box: true, compound: 'hard', boost: true });
    expect(JSON.stringify(race)).toBe(snapshot);
  });

  it('keeps positions consistent with accumulated race time', () => {
    const race = runLaps(createRace(baseConfig()), 6);
    const running = race.cars.filter((c) => c.status === 'running').sort((a, b) => a.position - b.position);
    for (let i = 1; i < running.length; i++) expect(running[i].elapsed).toBeGreaterThanOrEqual(running[i - 1].elapsed);
  });

  it('every rival completes its own race with its own stops', () => {
    const race = runLaps(createRace(baseConfig({ laps: 15 })), 15, scriptedOneStop(8));
    const finishers = race.cars.filter((c) => !c.isPlayer && c.status === 'running');
    expect(finishers.length).toBeGreaterThan(15);
    for (const car of finishers) {
      expect(car.lapsCompleted).toBe(15);
      expect(car.pitStops.length).toBeGreaterThanOrEqual(1);
      expect(new Set(car.usedCompounds).size).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('pit stops', () => {
  it('fit a fresh set, record the stint and add the pit-lane time', () => {
    const before = runLaps(createRace(baseConfig()), 4);
    const player = getPlayerCar(before);
    const wearBefore = player.tyre.wear;
    const after = advanceLap(before, { pace: 'standard', box: true, compound: 'hard', boost: false });
    const p = getPlayerCar(after);
    const circuit = getCircuit('sepang');

    expect(p.tyre).toEqual({ compound: 'hard', wear: 0, age: 0 });
    expect(p.allocation.hard).toBe(player.allocation.hard - 1);
    expect(p.pitStops).toHaveLength(1);
    const stop = p.pitStops[0];
    expect(stop.lap).toBe(5);
    expect(stop.from).toBe('medium');
    expect(stop.wearAtStop).toBeGreaterThan(wearBefore);
    expect(stop.laneLoss).toBeCloseTo(circuit.pitLaneLoss);
    expect(stop.totalLoss).toBeCloseTo(stop.laneLoss + stop.stationaryTime);
    expect(p.stints).toHaveLength(2);
    expect(p.stints[0]).toMatchObject({ compound: 'medium', startLap: 1, endLap: 5, laps: 5 });
    expect(p.stints[1]).toMatchObject({ compound: 'hard', startLap: 6, laps: 0 });
    expect(p.usedCompounds).toEqual(['medium', 'hard']);
    // The in-lap is slower than a normal lap by about the pit loss.
    const inLap = p.laps[4].lapTime;
    const previousLap = p.laps[3].lapTime;
    expect(inLap - previousLap).toBeGreaterThan(circuit.pitLaneLoss);
    expect(p.laps[4].pitted).toBe(true);
  });

  it('executes exactly one stop per decision', () => {
    let race = runLaps(createRace(baseConfig()), 3);
    race = advanceLap(race, { pace: 'standard', box: true, compound: 'soft', boost: false });
    race = advanceLap(race, defaultDecision(race));
    expect(getPlayerCar(race).pitStops).toHaveLength(1);
  });

  it('rejects invalid pit operations', () => {
    const race = createRace(baseConfig());
    const player = getPlayerCar(race);
    const noSets = structuredClone(race);
    getPlayerCar(noSets).allocation.soft = 0;
    expect(validateDecision(noSets, { pace: 'standard', box: true, compound: 'soft', boost: false })).toMatch(/No fresh/);
    expect(() => advanceLap(noSets, { pace: 'standard', box: true, compound: 'soft', boost: false })).toThrow(RaceEngineError);

    const lastLap = runLaps(race, 14);
    expect(validateDecision(lastLap, { pace: 'standard', box: true, compound: 'hard', boost: false })).toMatch(/final lap/);

    const flat = structuredClone(race);
    getPlayerCar(flat).battery = BOOST_COST - 1;
    expect(validateDecision(flat, { pace: 'standard', box: false, compound: player.tyre.compound, boost: true })).toMatch(/energy/);
    expect(validateDecision(race, { pace: 'turbo' as never, box: false, compound: 'medium', boost: false })).toMatch(/pace/);
    expect(validateDecision(race, { pace: 'standard', box: true, compound: 'slick' as never, boost: false })).toMatch(/compound/);
  });
});

describe('Safety Car', () => {
  it('deploys in the drill scenario and makes pit stops cheaper', () => {
    const race = runLaps(createRace(baseConfig({ scenario: 'safety-car-early' })), 3);
    expect(race.safetyCar.active).toBe(true);
    expect(race.events.some((e) => e.title === 'Safety Car deployed')).toBe(true);
    expect(validateDecision(race, { pace: 'standard', box: false, compound: 'medium', boost: true })).toMatch(/Safety Car/);

    const after = advanceLap(race, { pace: 'standard', box: true, compound: 'hard', boost: false });
    const stop = getPlayerCar(after).pitStops[0];
    const circuit = getCircuit('sepang');
    expect(stop.underSafetyCar).toBe(true);
    expect(stop.laneLoss).toBeCloseTo(circuit.pitLaneLoss * SC_PIT_FACTOR);
    expect(stop.totalLoss).toBeLessThan(circuit.pitLaneLoss + PIT_STATIONARY_MEAN - 5);
  });

  it('closes the field up and prevents overtaking', () => {
    const before = runLaps(createRace(baseConfig({ scenario: 'safety-car-early' })), 3);
    const after = advanceLap(before, defaultDecision(before));
    // Follow the same eight cars (none of which pitted on the Safety Car lap).
    const stayed = after.cars
      .filter((c) => c.status === 'running' && !c.laps.some((l) => l.lap === 4 && l.pitted))
      .map((c) => c.id);
    const ids = before.cars
      .filter((c) => stayed.includes(c.id))
      .sort((a, b) => a.elapsed - b.elapsed)
      .slice(0, 8)
      .map((c) => c.id);
    const spread = (s: RaceState) => {
      const times = s.cars.filter((c) => ids.includes(c.id)).map((c) => c.elapsed);
      return Math.max(...times) - Math.min(...times);
    };
    expect(spread(after)).toBeLessThan(spread(before));
    const order = (s: RaceState) =>
      s.cars
        .filter((c) => c.status === 'running' && !c.laps.some((l) => l.lap === 4 && l.pitted))
        .sort((a, b) => a.position - b.position)
        .map((c) => c.id);
    const beforeOrder = order(before).filter((id) => order(after).includes(id));
    expect(order(after)).toEqual(beforeOrder);
  });

  it('ends after its seeded duration', () => {
    let race = runLaps(createRace(baseConfig({ scenario: 'safety-car-early' })), 3);
    const duration = race.safetyCar.lapsRemaining;
    race = runLaps(race, duration);
    expect(race.safetyCar.active).toBe(false);
    expect(race.events.some((e) => e.title === 'Green flag')).toBe(true);
  });
});

describe('weather', () => {
  it('turns rain into a wet track and makes the right tyre much faster', () => {
    let race = createRace(baseConfig({ circuitId: 'spa', weather: 'variable', scenario: 'storm', laps: 15 }));
    race = runLaps(race, 7);
    expect(race.weather.wetness).toBeGreaterThan(0.5);
    expect(race.events.some((e) => e.kind === 'weather')).toBe(true);
    // Rivals react by switching to treaded tyres.
    const onWets = race.cars.filter((c) => c.tyre.compound === 'wet' || c.tyre.compound === 'inter');
    expect(onWets.length).toBeGreaterThan(10);
    const player = getPlayerCar(race);
    const playerLap = player.laps[player.laps.length - 1].lapTime;
    const wetRunner = onWets.find((c) => c.tyre.age > 0)!;
    expect(playerLap - wetRunner.laps[wetRunner.laps.length - 1].lapTime).toBeGreaterThan(5);
  });

  it('keeps a dry race dry', () => {
    const race = runLaps(createRace(baseConfig({ weather: 'dry' })), 15, scriptedOneStop(7));
    expect(race.wetnessHistory.every((w) => w === 0)).toBe(true);
  });
});

describe('determinism', () => {
  it('produces identical races for the same seed and decisions', () => {
    const play = () => runLaps(createRace(baseConfig({ seed: 777, weather: 'variable' })), 15, scriptedOneStop(6, 'soft'));
    expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
  });

  it('produces different races for different seeds', () => {
    const a = runLaps(createRace(baseConfig({ seed: 1 })), 5);
    const b = runLaps(createRace(baseConfig({ seed: 2 })), 5);
    expect(JSON.stringify(a.cars)).not.toBe(JSON.stringify(b.cars));
  });

  it('player decisions change the outcome', () => {
    const a = runLaps(createRace(baseConfig()), 15, scriptedOneStop(5, 'hard'));
    const b = runLaps(createRace(baseConfig()), 15, scriptedOneStop(10, 'soft'));
    expect(getPlayerCar(a).elapsed).not.toBeCloseTo(getPlayerCar(b).elapsed, 1);
  });
});

describe('classification', () => {
  it('orders finishers by time and lists the winner first', () => {
    const race = runLaps(createRace(baseConfig()), 15, scriptedOneStop(7));
    const result = race.classification!;
    const finishers = result.filter((e) => e.status === 'finished' && e.lapsDown === 0);
    expect(result[0].gapToWinner).toBe(0);
    for (let i = 1; i < finishers.length; i++) expect(finishers[i].totalTime).toBeGreaterThanOrEqual(finishers[i - 1].totalTime);
    expect(result.map((e) => e.position)).toEqual(result.map((_, i) => i + 1));
  });

  it('places retired cars after finishers and handles lapped cars', () => {
    const race = runLaps(createRace(baseConfig({ laps: 10 })), 10, scriptedOneStop(5));
    const state = structuredClone(race);
    // Retire one car and put another more than a lap behind.
    const [retired, lapped] = state.cars.filter((c) => !c.isPlayer).slice(-2);
    retired.status = 'retired';
    retired.lapsCompleted = 4;
    retired.laps = retired.laps.slice(0, 4);
    const lead = Math.min(...state.cars.filter((c) => c.status === 'running').map((c) => c.elapsed));
    lapped.laps = lapped.laps.map((l) => ({ ...l, elapsed: l.elapsed + 200 }));
    lapped.elapsed += 200;
    const result = classify(state);
    const last = result[result.length - 1];
    expect(last.carId).toBe(retired.id);
    expect(last.status).toBe('retired');
    const lappedEntry = result.find((e) => e.carId === lapped.id)!;
    expect(lappedEntry.lapsDown).toBeGreaterThanOrEqual(1);
    expect(lappedEntry.gapToWinner).toBeNull();
    expect(lead).toBeGreaterThan(0);
  });

  it('penalises a fully dry race on a single compound', () => {
    const race = runLaps(createRace(baseConfig({ laps: 10 })), 10);
    const entry = race.classification!.find((e) => e.carId === getPlayerCar(race).id)!;
    if (entry.status === 'finished') expect(entry.penaltyTime).toBe(COMPOUND_RULE_PENALTY);
  });
});
