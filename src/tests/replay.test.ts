import { describe, expect, it } from 'vitest';
import { advanceLap, createRace, getPlayerCar } from '../game/engine';
import { GRID_SLOT, PIT_BOX, buildTimelines, finishTime, lineTime, liveOrder, positionAt } from '../game/replay';
import { pauseReasonFor } from '../hooks/useRacePlayback';
import { baseConfig, runLaps, scriptedOneStop } from './helpers';

describe('live playback timelines', () => {
  it('starts every car from its grid slot and moves it round the lap at its own pace', () => {
    const race = runLaps(createRace(baseConfig()), 2);
    const timelines = buildTimelines(race);
    const pole = timelines.find((t) => race.cars.find((c) => c.id === t.id)!.gridPosition === 1)!;
    const fifth = timelines.find((t) => race.cars.find((c) => c.id === t.id)!.gridPosition === 5)!;
    expect(positionAt(pole, 0).phase).toBe('grid');
    expect(positionAt(fifth, 0).fraction).toBeCloseTo(-4 * GRID_SLOT);

    const lap1 = pole.segments[0];
    const mid = positionAt(pole, (lap1.start + lap1.end) / 2);
    expect(mid.distance).toBeGreaterThan(0.4);
    expect(mid.distance).toBeLessThan(0.6);
    expect(positionAt(pole, lap1.end + 0.001).distance).toBeGreaterThan(1);
    // Before the next lap is computed the car waits on the line.
    expect(positionAt(pole, 1e6).distance).toBe(2);
  });

  it('agrees with the engine at the line: the leader crosses first', () => {
    const race = runLaps(createRace(baseConfig()), 3);
    const t = lineTime(race, 3);
    const order = liveOrder(buildTimelines(race), t - 0.01);
    const leader = [...race.cars].sort((a, b) => a.laps[2].elapsed - b.laps[2].elapsed)[0];
    expect(order[0]).toBe(leader.id);
    expect(t).toBeCloseTo(leader.laps[2].elapsed);
  });

  it('takes a pitting car down the pit lane and holds it at its box for the stationary time', () => {
    const race = runLaps(createRace(baseConfig()), 3, (s) => ({ pace: 'standard', box: s.lap === 1, compound: 'hard', boost: false }));
    const player = getPlayerCar(race);
    const tl = buildTimelines(race).find((t) => t.id === player.id)!;
    const inLap = tl.segments[1];
    expect(inLap.pit).toBeDefined();
    const samples = Array.from({ length: 400 }, (_, i) => positionAt(tl, inLap.start + ((inLap.end - inLap.start) * i) / 399));
    const stopped = samples.filter((p) => p.inPit && Math.abs(p.fraction - PIT_BOX) < 1e-9);
    expect(stopped.length).toBeGreaterThan(0);
    expect(samples.some((p) => p.phase === 'pit')).toBe(true);
    expect(samples[0].phase).toBe('racing');
    // The out-lap starts on the pit exit road.
    expect(positionAt(tl, tl.segments[2].start + 0.01).inPit).toBe(true);
  });

  it('brings every classified car over the line and parks it after the flag', () => {
    const race = runLaps(createRace(baseConfig({ laps: 10 })), 10, scriptedOneStop(5));
    const end = finishTime(race);
    expect(end).toBeGreaterThanOrEqual(lineTime(race, 10));
    for (const tl of buildTimelines(race)) {
      const p = positionAt(tl, end + 10);
      expect(['finished', 'stopped']).toContain(p.phase);
    }
  });
});

describe('key moments', () => {
  it('pauses for a Safety Car', () => {
    const race = runLaps(createRace(baseConfig({ scenario: 'safety-car-early' })), 3);
    expect(pauseReasonFor(race)).toMatch(/Safety Car deployed/);
    const calm = advanceLap(createRace(baseConfig()), { pace: 'standard', box: false, compound: 'medium', boost: false });
    expect(pauseReasonFor(calm)).toBeNull();
  });
});
