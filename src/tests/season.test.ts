import { describe, expect, it } from 'vitest';
import { CIRCUITS, SPRINT_WEEKENDS } from '../game/data/circuits';
import { DRIVERS } from '../game/data/teams';
import { createRace, getPlayerCar } from '../game/engine';
import { weekendSessions } from '../game/season/calendar';
import {
  allowedCompounds,
  createQualifying,
  qualifyingGrid,
  runQualifyingSegment,
  type SessionContext,
} from '../game/season/sessions';
import {
  completeQualifying,
  constructorStandings,
  createSeason,
  currentSession,
  driverStandings,
  finishTesting,
  pointsFor,
  raceConfigFor,
  recordRace,
  runPracticeSession,
  runQualifying,
  runTesting,
  simulateWithStrategist,
} from '../game/season/season';
import { loadSeason, saveSeason } from '../game/season/persistence';
import type { SeasonState } from '../game/season/types';
import { BrokenStorage, MemoryStorage } from './helpers';
import { getCircuit } from '../game/data/circuits';

const newSeason = (seed = 2026) => createSeason({ playerDriverId: 'nor', difficulty: 'normal', raceLaps: 10, seed });

/** Plays the current weekend to the flag with simple choices and the strategist in charge of races. */
function playWeekend(season: SeasonState): SeasonState {
  let s = season;
  for (let guard = 0; guard < 12 && s.phase === 'weekend'; guard++) {
    const round = s.round;
    const session = currentSession(s);
    if (!session) break;
    if (session.startsWith('fp')) s = runPracticeSession(s, 'setup');
    else if (session === 'quali' || session === 'sprint-quali') s = completeQualifying(runQualifying(s, null));
    else {
      const config = raceConfigFor(s, 'medium')!;
      s = recordRace(s, simulateWithStrategist(createRace(config)), true);
    }
    if (s.round !== round) break;
  }
  return s;
}

describe('season calendar', () => {
  it('has six Sprint weekends with the Sprint format and standard weekends elsewhere', () => {
    const sprints = CIRCUITS.filter((c) => c.sprint).map((c) => c.id);
    expect(sprints).toEqual(['shanghai', 'miami', 'montreal', 'silverstone', 'zandvoort', 'marina-bay']);
    expect(SPRINT_WEEKENDS.size).toBe(6);
    expect(weekendSessions(getCircuit('shanghai'))).toEqual(['fp1', 'sprint-quali', 'sprint', 'quali', 'race']);
    expect(weekendSessions(getCircuit('monaco'))).toEqual(['fp1', 'fp2', 'fp3', 'quali', 'race']);
  });

  it('awards 2026 points: top ten in the Grand Prix, top eight in the Sprint', () => {
    expect([1, 2, 3, 10, 11].map((p) => pointsFor('race', p))).toEqual([25, 18, 15, 1, 0]);
    expect([1, 2, 8, 9].map((p) => pointsFor('sprint', p))).toEqual([8, 7, 1, 0]);
  });
});

describe('pre-season testing', () => {
  it('runs six days and turns the programmes into season-long development', () => {
    let s = newSeason();
    expect(s.phase).toBe('testing');
    for (const p of ['aero', 'aero', 'race-sims', 'pit-practice', 'mileage', 'aero'] as const) s = runTesting(s, p);
    expect(s.testing.days).toHaveLength(6);
    expect(s.testing.days[0].entries).toHaveLength(11);
    expect(s.testing.development.pace).toBeGreaterThan(0.5);
    expect(s.testing.development.tyres).toBeGreaterThan(0.2);
    expect(runTesting(s, 'aero')).toBe(s);
    s = finishTesting(s);
    expect(s.phase).toBe('weekend');
    expect(s.weekend?.circuitId).toBe('albert-park');
    expect(currentSession(s)).toBe('fp1');
  });
});

describe('qualifying', () => {
  const ctx: SessionContext = { circuit: getCircuit('monza'), difficulty: 'normal', playerDriverId: 'nor', effects: {}, seed: 7 };

  it('knocks out six cars in Q1 and Q2 and builds the grid from Q3 down', () => {
    let q = createQualifying('quali', { scenario: 'dry', wetness: 0 }, 1);
    for (let i = 0; i < 3; i++) q = runQualifyingSegment(q, { ...ctx, seed: 10 + i }, null);
    expect(q.segments.map((s) => s.entries.length)).toEqual([22, 16, 10]);
    expect(q.segments.map((s) => s.eliminated.length)).toEqual([6, 6, 0]);
    expect(q.grid).toHaveLength(22);
    expect(new Set(q.grid).size).toBe(22);
    expect(q.grid!.slice(0, 10)).toEqual(q.segments[2].entries.map((e) => e.driverId));
    expect(q.grid!.slice(16)).toEqual(q.segments[0].eliminated);
    expect(qualifyingGrid(q.segments)).toEqual(q.grid);
  });

  it('uses mediums in SQ1 and SQ2 and softs in SQ3 when dry', () => {
    expect(allowedCompounds('sprint-quali', 1, 0)).toEqual(['medium']);
    expect(allowedCompounds('sprint-quali', 3, 0)).toEqual(['soft']);
    expect(allowedCompounds('quali', 1, 0)).toContain('hard');
    expect(allowedCompounds('quali', 1, 0.7)).toContain('wet');
  });

  it('is deterministic for the same seed and choice', () => {
    const run = () => runQualifyingSegment(createQualifying('quali', { scenario: 'dry', wetness: 0 }, 1), ctx, { compound: 'soft', plan: 'all-in' });
    expect(run()).toEqual(run());
  });
});

describe('race weekends', () => {
  it('feeds the qualifying grid and weekend effects into the Grand Prix', () => {
    let s = finishTesting(newSeason());
    s = runPracticeSession(s, 'setup');
    expect(s.weekend!.prep.setup).toBeGreaterThan(0.3);
    s = runPracticeSession(s, 'long-runs');
    s = runPracticeSession(s, 'quali-sim');
    expect(currentSession(s)).toBe('quali');
    s = runQualifying(s, { compound: 'medium', plan: 'standard' });
    s = completeQualifying(runQualifying(s, { compound: 'soft', plan: 'standard' }));
    expect(currentSession(s)).toBe('race');
    const config = raceConfigFor(s, 'medium')!;
    expect(config.grid).toEqual(s.weekend!.qualifying.quali!.grid);
    expect(config.session).toBe('race');
    const race = createRace(config);
    expect(race.cars.map((c) => c.driverId)).toEqual(config.grid);
    expect(getPlayerCar(race).paceBonus).toBeLessThan(0);
    if (s.weekend!.qualifying.quali!.savedSoftSets > 0) expect(getPlayerCar(race).allocation.soft).toBeGreaterThan(2);
  });

  it('runs a Sprint weekend with Sprint points and no two-compound rule', () => {
    let s = finishTesting(newSeason());
    s = playWeekend(s);
    expect(s.round).toBe(2);
    expect(currentSession(s)).toBe('fp1');
    s = runPracticeSession(s, 'setup');
    expect(currentSession(s)).toBe('sprint-quali');
    s = completeQualifying(runQualifying(s, null));
    expect(currentSession(s)).toBe('sprint');
    const config = raceConfigFor(s, 'medium')!;
    expect(config.session).toBe('sprint');
    expect(config.laps).toBe(5);
    const sprint = simulateWithStrategist(createRace(config));
    expect(sprint.classification!.every((e) => e.penaltyTime === 0)).toBe(true);
    s = recordRace(s, sprint, true);
    expect(s.weekend!.sprint!.rows.filter((r) => r.points > 0).length).toBeLessThanOrEqual(8);
    expect(currentSession(s)).toBe('quali');
  });

  it('plays a full season to the final standings', () => {
    let s = finishTesting(newSeason(77));
    for (let i = 0; i < CIRCUITS.length && s.phase === 'weekend'; i++) s = playWeekend(s);
    expect(s.phase).toBe('finished');
    expect(s.results).toHaveLength(23);
    expect(s.results.filter((r) => r.sprint)).toHaveLength(6);
    const drivers = driverStandings(s);
    const teams = constructorStandings(s);
    expect(drivers).toHaveLength(DRIVERS.length);
    expect(teams).toHaveLength(11);
    const totalPoints = drivers.reduce((sum, d) => sum + d.points, 0);
    expect(totalPoints).toBe(teams.reduce((sum, t) => sum + t.points, 0));
    // 23 Grands Prix (101 points each) plus 6 Sprints (36 each), less any points lost to retirements.
    expect(totalPoints).toBeLessThanOrEqual(23 * 101 + 6 * 36);
    expect(totalPoints).toBeGreaterThan(23 * 90);
    expect(drivers[0].points).toBeGreaterThanOrEqual(drivers[1].points);
  }, 120_000);
});

describe('season persistence', () => {
  it('saves and restores a season and rejects broken data', () => {
    const storage = new MemoryStorage();
    const s = runTesting(newSeason(), 'aero');
    expect(saveSeason(s, storage)).toBe(true);
    expect(loadSeason(storage)).toEqual(s);
    storage.setItem('f1sl.season.v1', '{"version":1,"config":{}}');
    expect(loadSeason(storage)).toBeNull();
    expect(saveSeason(s, new BrokenStorage())).toBe(false);
  });
});
