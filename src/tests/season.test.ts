import { describe, expect, it } from 'vitest';
import { CIRCUITS, SPRINT_WEEKENDS, getCircuit } from '../game/data/circuits';
import { DRIVERS } from '../game/data/teams';
import { createRace, getManagedCars } from '../game/engine';
import { initialStats, statsPace } from '../game/manager/carStats';
import { PARTS, designDays, facilityUpgrade } from '../game/manager/development';
import { COST_CAP, objectiveMet } from '../game/manager/finance';
import { NEUTRAL_SETUP, idealSetup, readSetup, setupPace, setupQuality, suggestedSetup } from '../game/manager/setup';
import { weekendSessions } from '../game/season/calendar';
import {
  allowedCompounds,
  createQualifying,
  qualifyingGrid,
  runQualifyingSegment,
  type SessionContext,
} from '../game/season/sessions';
import {
  advanceDate,
  capHeadroom,
  changeSetup,
  completeQualifying,
  constructorStandings,
  createSeason,
  currentSession,
  driverStandings,
  engineerProposal,
  finishTesting,
  idealFor,
  managedDrivers,
  managedInQualifying,
  markRead,
  pointsFor,
  projectBlocker,
  raceConfigFor,
  recordRace,
  runPracticeSession,
  runQualifying,
  runTesting,
  setupLocked,
  setupQualityFor,
  simulateWithStrategist,
  startProject,
  unreadCount,
  upgradeFacility,
} from '../game/season/season';
import { loadSeason, saveSeason } from '../game/season/persistence';
import type { SeasonState } from '../game/season/types';
import { BrokenStorage, MemoryStorage } from './helpers';

const newSeason = (seed = 2026, teamId = 'mclaren') => createSeason({ teamId, difficulty: 'normal', seed });

/** Short races keep these tests fast; the season logic does not depend on race distance. */
const quickRace = (config: NonNullable<ReturnType<typeof raceConfigFor>>) => createRace({ ...config, laps: 5 });

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
      s = recordRace(s, simulateWithStrategist(quickRace(raceConfigFor(s, 'medium')!)), true);
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

describe('career start', () => {
  it('puts you in charge of both cars of the team with a budget, partners and a board target', () => {
    const s = newSeason(2026, 'williams');
    expect(managedDrivers(s)).toEqual(DRIVERS.filter((d) => d.teamId === 'williams').map((d) => d.id));
    expect(s.finance.balance).toBeGreaterThan(0);
    expect(s.finance.capSpent).toBe(0);
    expect(s.sponsors).toHaveLength(3);
    expect(s.boardTarget).toBeGreaterThanOrEqual(1);
    expect(s.boardTarget).toBeLessThanOrEqual(10);
    expect(unreadCount(s)).toBe(2);
    expect(unreadCount(markRead(s))).toBe(0);
    expect(s.carStats.williams).toEqual(initialStats('williams'));
  });
});

describe('pre-season testing', () => {
  it('runs six days and turns the programmes into season-long development', () => {
    let s = newSeason();
    expect(s.phase).toBe('testing');
    for (const p of ['aero', 'aero', 'race-sims', 'pit-practice', 'mileage', 'aero'] as const) s = runTesting(s, p);
    expect(s.testing.days).toHaveLength(6);
    expect(s.testing.days[0].entries).toHaveLength(11);
    expect(s.date).toBe('2026-02-20');
    expect(s.testing.development.pace).toBeGreaterThan(0.5);
    expect(s.testing.development.tyres).toBeGreaterThan(0.2);
    expect(runTesting(s, 'aero')).toBe(s);
    s = finishTesting(s);
    expect(s.phase).toBe('weekend');
    expect(s.weekend?.circuitId).toBe('albert-park');
    expect(s.date).toBe('2026-03-06');
    expect(currentSession(s)).toBe('fp1');
  });
});

describe('car ratings', () => {
  it('reward the right strengths at each circuit', () => {
    const base = initialStats('ferrari');
    const fast = { ...base, straightLine: base.straightLine + 10 };
    const grippy = { ...base, lowSpeed: base.lowSpeed + 10 };
    const monza = getCircuit('monza');
    const monaco = getCircuit('monaco');
    expect(statsPace(base, monza) - statsPace(fast, monza)).toBeGreaterThan(statsPace(base, monaco) - statsPace(fast, monaco));
    expect(statsPace(base, monaco) - statsPace(grippy, monaco)).toBeGreaterThan(statsPace(base, monza) - statsPace(grippy, monza));
    // Faster teams start with better ratings.
    expect(statsPace(initialStats('mercedes'), monza)).toBeLessThan(statsPace(initialStats('cadillac'), monza));
  });
});

describe('car development and facilities', () => {
  it('designs a part over the calendar and fits it when ready', () => {
    let s = newSeason();
    const before = s.carStats.mclaren;
    const balance = s.finance.balance;
    s = startProject(s, 'floor');
    expect(s.projects).toHaveLength(1);
    expect(s.finance.balance).toBeCloseTo(balance - PARTS.floor.cost, 5);
    expect(s.finance.capSpent).toBe(PARTS.floor.cost);
    expect(projectBlocker(s, 'floor')).toMatch(/Already/);
    expect(startProject(s, 'floor')).toBe(s);
    const ready = s.projects[0].ready;
    expect(ready > s.date).toBe(true);
    expect(designDays('floor', s.facilities)).toBeGreaterThan(designDays('frontWing', s.facilities));
    s = advanceDate(s, ready);
    expect(s.projects).toHaveLength(0);
    expect(s.upgrades).toHaveLength(1);
    expect(s.upgrades[0].part).toBe('floor');
    const after = s.carStats.mclaren;
    expect(after.highSpeed + after.mediumSpeed).not.toBe(before.highSpeed + before.mediumSpeed);
    expect(s.inbox[0].from).toBe('Technical director');
  });

  it('limits projects by the factory, the bank balance and the cost cap', () => {
    let s = newSeason(5, 'haas');
    let started = 0;
    for (const part of ['frontWing', 'rearWing', 'floor', 'sidepods', 'suspension'] as const) {
      const next = startProject(s, part);
      if (next !== s) started += 1;
      s = next;
    }
    expect(started).toBeLessThan(5);
    expect(projectBlocker(s, 'suspension')).not.toBeNull();
    // Nearly all of the cap is committed: no room for development.
    const capped: SeasonState = { ...newSeason(), finance: { balance: 500, capSpent: COST_CAP - 100, ledger: [] } };
    expect(capHeadroom(capped)).toBeLessThan(PARTS.frontWing.cost);
    expect(projectBlocker(capped, 'frontWing')).toMatch(/cost cap/);
    const broke: SeasonState = { ...newSeason(), finance: { balance: 1, capSpent: 0, ledger: [] } };
    expect(projectBlocker(broke, 'frontWing')).toMatch(/money/);
  });

  it('upgrades a facility after the building work', () => {
    let s = newSeason();
    const level = s.facilities.simulator.level;
    const { cost, days } = facilityUpgrade(level);
    const balance = s.finance.balance;
    s = upgradeFacility(s, 'simulator');
    expect(s.finance.balance).toBeCloseTo(balance - cost, 5);
    expect(s.finance.capSpent).toBe(0);
    expect(s.facilities.simulator.upgradeReady).toBeDefined();
    expect(upgradeFacility(s, 'simulator')).toBe(s);
    s = advanceDate(s, '2026-12-31');
    expect(s.facilities.simulator.level).toBe(level + 1);
    expect(days).toBeGreaterThan(0);
  });
});

describe('setup work', () => {
  it('scores setups by distance from the ideal and turns them into lap time', () => {
    const ideal = idealSetup(getCircuit('monaco'), 'lec', 1);
    expect(setupQuality(ideal, ideal)).toBe(1);
    expect(setupQuality(NEUTRAL_SETUP, ideal)).toBeLessThan(1);
    expect(setupPace(1)).toBeLessThan(setupPace(0.5));
    // Monaco wants more wing than Monza.
    const monza = idealSetup(getCircuit('monza'), 'lec', 1);
    expect(ideal.rearWing).toBeGreaterThan(monza.rearWing);
  });

  it('gets closer to the ideal by following the driver feedback', () => {
    const ideal = idealSetup(getCircuit('silverstone'), 'nor', 3);
    let values = { ...NEUTRAL_SETUP, frontWing: 5, rearWing: 95 };
    const start = setupQuality(values, ideal);
    for (let i = 0; i < 4; i++) values = suggestedSetup(values, readSetup(values, ideal, 0.8, 10 + i));
    expect(setupQuality(values, ideal)).toBeGreaterThan(start);
  });

  it('collects feedback in practice and locks the setup at qualifying', () => {
    let s = finishTesting(newSeason());
    const [lead] = managedDrivers(s);
    expect(setupLocked(s)).toBe(false);
    expect(engineerProposal(s, lead)).toBeNull();
    s = runPracticeSession(s, 'setup');
    expect(s.weekend!.setups[lead].feedback).not.toBeNull();
    expect(s.weekend!.practice[0].feedback?.[lead]).toBeDefined();
    const proposal = engineerProposal(s, lead)!;
    s = changeSetup(s, lead, proposal);
    expect(s.weekend!.setups[lead].values).toEqual(proposal);
    // A perfect setup is worth more than a poor one.
    const perfect = changeSetup(s, lead, idealFor(s, lead));
    expect(setupQualityFor(perfect, lead)).toBe(1);
    s = runPracticeSession(runPracticeSession(s, 'long-runs'), 'quali-sim');
    expect(currentSession(s)).toBe('quali');
    expect(setupLocked(s)).toBe(false);
    s = runQualifying(s, null);
    expect(setupLocked(s)).toBe(true);
    expect(changeSetup(s, lead, { frontWing: 0 })).toBe(s);
  });
});

describe('qualifying', () => {
  const ctx: SessionContext = { circuit: getCircuit('monza'), difficulty: 'normal', playerDriverId: 'nor', managedDriverIds: ['nor', 'pia'], effects: {}, seed: 7 };

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

  it('runs each of your cars on its own choice and is deterministic', () => {
    const choices = { nor: { compound: 'soft' as const, plan: 'all-in' as const }, pia: { compound: 'medium' as const, plan: 'safe' as const } };
    const run = () => runQualifyingSegment(createQualifying('quali', { scenario: 'dry', wetness: 0 }, 1), ctx, choices);
    expect(run()).toEqual(run());
    const q = run();
    expect(q.segments[0].choices).toEqual(choices);
    expect(q.segments[0].entries.find((e) => e.driverId === 'pia')?.compound).toBe('medium');
  });
});

describe('race weekends', () => {
  it('feeds the qualifying grid, both cars and the car ratings into the Grand Prix', () => {
    let s = finishTesting(newSeason());
    const [lead, second] = managedDrivers(s);
    s = runPracticeSession(s, 'setup');
    expect(s.weekend!.prep.setup).toBeGreaterThan(0.3);
    s = runPracticeSession(s, 'long-runs');
    s = runPracticeSession(s, 'quali-sim');
    expect(currentSession(s)).toBe('quali');
    s = runQualifying(s, { [lead]: { compound: 'medium', plan: 'standard' }, [second]: { compound: 'soft', plan: 'standard' } });
    expect(managedInQualifying(s, 'quali').length).toBeGreaterThanOrEqual(0);
    s = completeQualifying(s);
    expect(currentSession(s)).toBe('race');
    const config = raceConfigFor(s, { [lead]: 'medium', [second]: 'hard' })!;
    expect(config.grid).toEqual(s.weekend!.qualifying.quali!.grid);
    expect(config.session).toBe('race');
    expect(config.laps).toBe(58);
    expect(config.managedDriverIds).toEqual([lead, second]);
    expect(config.carStats).toBe(s.carStats);
    const race = createRace(config);
    expect(race.cars.map((c) => c.driverId)).toEqual(config.grid);
    const managed = getManagedCars(race);
    expect(managed.map((c) => c.driverId).sort()).toEqual([lead, second].sort());
    expect(managed.find((c) => c.driverId === second)?.tyre.compound).toBe('hard');
    const saved = s.weekend!.qualifying.quali!.savedSoftSets[lead] ?? 0;
    if (saved > 0) expect(managed.find((c) => c.driverId === lead)!.allocation.soft).toBeGreaterThan(2);
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
    expect(config.laps).toBe(19);
    const sprint = simulateWithStrategist(quickRace(config));
    expect(sprint.classification!.every((e) => e.penaltyTime === 0)).toBe(true);
    s = recordRace(s, sprint, true);
    expect(s.weekend!.sprint!.rows.filter((r) => r.points > 0).length).toBeLessThanOrEqual(8);
    expect(currentSession(s)).toBe('quali');
  });

  it('settles the money after each Grand Prix and reports to the inbox', () => {
    const s0 = finishTesting(newSeason());
    const before = s0.finance;
    const s = playWeekend(s0);
    expect(s.round).toBe(2);
    const labels = s.finance.ledger.map((e) => e.label);
    expect(labels).toContain('Partner payments');
    expect(labels).toContain('Salaries');
    expect(labels.some((l) => l.startsWith('Prize fund'))).toBe(true);
    expect(labels.some((l) => l.endsWith('operations'))).toBe(true);
    expect(s.finance.capSpent).toBeGreaterThan(before.capSpent);
    expect(s.inbox.some((m) => m.from === 'Sporting director')).toBe(true);
    expect(s.date).toBe('2026-03-13');
  });

  it('checks sponsor objectives from both cars', () => {
    expect(objectiveMet('bothPoints', { positions: [4, 9] })).toBe(true);
    expect(objectiveMet('bothPoints', { positions: [4, null] })).toBe(false);
    expect(objectiveMet('podium', { positions: [12, 3] })).toBe(true);
    expect(objectiveMet('bothFinish', { positions: [18, null] })).toBe(false);
  });

  it('plays a full season to the final standings and the board verdict', () => {
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
    expect(s.inbox[0].from).toBe('The board');
    // Rivals developed their cars through the year.
    expect(s.carStats.mercedes).not.toEqual(initialStats('mercedes'));
  }, 120_000);
});

describe('season persistence', () => {
  it('saves and restores a career and rejects broken data', () => {
    const storage = new MemoryStorage();
    const s = runTesting(newSeason(), 'aero');
    expect(saveSeason(s, storage)).toBe(true);
    expect(loadSeason(storage)).toEqual(s);
    storage.setItem('f1sl.career.v1', '{"version":2,"config":{}}');
    expect(loadSeason(storage)).toBeNull();
    expect(saveSeason(s, new BrokenStorage())).toBe(false);
  });
});
