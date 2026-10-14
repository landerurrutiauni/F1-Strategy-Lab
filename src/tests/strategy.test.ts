import { describe, expect, it } from 'vitest';
import { COMPOUND_RULE_PENALTY } from '../game/constants';
import { CIRCUITS, nextRound } from '../game/data/circuits';
import { DRIVERS, TEAMS } from '../game/data/teams';
import { advanceLap, createRace, getPlayerCar } from '../game/engine';
import { compoundRulePenalty, estimateRejoin, evaluateStrategies, highlightPlans } from '../game/projection';
import { gradeFor, rateStrategy } from '../game/rating';
import { buildTrackGeometry } from '../game/trackGeometry';
import { baseConfig, runLaps, scriptedOneStop } from './helpers';

describe('strategy projection', () => {
  it('finds plans that respect the tyre allocation and the compound rule', () => {
    const race = createRace(baseConfig());
    const outlook = evaluateStrategies(race, getPlayerCar(race).id)!;
    expect(outlook.plans.length).toBeGreaterThan(50);
    expect(outlook.best.penalty).toBe(0);
    expect(outlook.best.stops.length).toBeGreaterThanOrEqual(1);
    for (const plan of outlook.plans.slice(0, 200)) {
      const counts: Record<string, number> = {};
      for (const s of plan.stops) counts[s.compound] = (counts[s.compound] ?? 0) + 1;
      for (const [compound, n] of Object.entries(counts)) expect(n).toBeLessThanOrEqual(getPlayerCar(race).allocation[compound as 'soft']);
    }
    expect(highlightPlans(outlook, 3).length).toBeGreaterThan(1);
  });

  it('charges the compound-rule penalty only for single-compound dry races', () => {
    expect(compoundRulePenalty(['medium'])).toBe(COMPOUND_RULE_PENALTY);
    expect(compoundRulePenalty(['medium', 'hard'])).toBe(0);
    expect(compoundRulePenalty(['medium', 'inter'])).toBe(0);
  });

  it('makes pitting under the Safety Car cheaper than under green', () => {
    const green = runLaps(createRace(baseConfig()), 3);
    const sc = runLaps(createRace(baseConfig({ scenario: 'safety-car-early' })), 3);
    const greenRejoin = estimateRejoin(green, getPlayerCar(green).id)!;
    const scRejoin = estimateRejoin(sc, getPlayerCar(sc).id)!;
    expect(scRejoin.pitLoss).toBeLessThan(greenRejoin.pitLoss - 8);
    const scOutlook = evaluateStrategies(sc, getPlayerCar(sc).id)!;
    const greenOutlook = evaluateStrategies(green, getPlayerCar(green).id)!;
    expect(scOutlook.pitNowDelta!).toBeLessThan(greenOutlook.pitNowDelta!);
  });

  it('recommends treaded tyres when heavy rain arrives', () => {
    const race = runLaps(createRace(baseConfig({ circuitId: 'spa', weather: 'variable', scenario: 'storm' })), 6);
    const outlook = evaluateStrategies(race, getPlayerCar(race).id)!;
    expect(outlook.best.boxNow).toBe(true);
    expect(['inter', 'wet']).toContain(outlook.best.stops[0].compound);
  });

  it('returns nothing once the race is over', () => {
    const race = runLaps(createRace(baseConfig({ laps: 10 })), 10, scriptedOneStop(5));
    expect(evaluateStrategies(race, getPlayerCar(race).id)).toBeNull();
  });
});

describe('strategy rating', () => {
  it('scores between 0 and 100 with a matching grade and an explanation', () => {
    const race = runLaps(createRace(baseConfig()), 15, scriptedOneStop(7));
    const rating = rateStrategy(race);
    expect(rating.score).toBeGreaterThanOrEqual(0);
    expect(rating.score).toBeLessThanOrEqual(100);
    expect(rating.grade).toBe(gradeFor(rating.score));
    expect(rating.factors.map((f) => f.id)).toEqual(expect.arrayContaining(['pit', 'tyres', 'execution']));
    expect(rating.headline.length).toBeGreaterThan(10);
  });

  it('rates following the projected best plan above ignoring the tyres', () => {
    const smart = (s: Parameters<typeof advanceLap>[0]) => {
      const o = evaluateStrategies(s, getPlayerCar(s).id);
      return { pace: 'standard' as const, box: !!o?.best.boxNow, compound: o?.best.boxNow ? o.best.stops[0].compound : getPlayerCar(s).tyre.compound, boost: false };
    };
    const good = rateStrategy(runLaps(createRace(baseConfig({ seed: 321 })), 15, smart));
    const poor = rateStrategy(runLaps(createRace(baseConfig({ seed: 321, startCompound: 'soft' })), 15, () => ({ pace: 'push', box: false, compound: 'soft', boost: false })));
    expect(good.score).toBeGreaterThan(poor.score);
    expect(poor.keyDecisions.some((k) => k.effect === 'harmed')).toBe(true);
  });
});

describe('data', () => {
  it('has the 23-round 2026 calendar in order with unique layouts', () => {
    expect(CIRCUITS).toHaveLength(23);
    CIRCUITS.forEach((c, i) => {
      expect(c.round).toBe(i + 1);
      expect(c.outline.length).toBeGreaterThan(100);
      const geometry = buildTrackGeometry(c.id, c.outline);
      expect(geometry.length).toBeGreaterThan(500);
      for (const [x, y] of c.outline) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(600);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(400);
      }
    });
    expect(CIRCUITS.find((c) => c.grandPrix === 'Bahrain Grand Prix')?.id).toBe('sepang');
    expect(nextRound(new Date('2026-10-14')).id).toBe('cota');
    expect(nextRound(new Date('2027-01-01')).id).toBe('yas-marina');
  });

  it('has 11 teams with two drivers and a race engineer each', () => {
    expect(TEAMS).toHaveLength(11);
    expect(DRIVERS).toHaveLength(22);
    for (const team of TEAMS) expect(DRIVERS.filter((d) => d.teamId === team.id)).toHaveLength(2);
    for (const d of DRIVERS) expect(d.engineer.length).toBeGreaterThan(3);
    expect(new Set(DRIVERS.map((d) => d.number)).size).toBe(22);
  });

  it('can start a race at every round with any driver', () => {
    for (const circuit of CIRCUITS) {
      const race = createRace(baseConfig({ circuitId: circuit.id, playerDriverId: DRIVERS[circuit.round % DRIVERS.length].id }));
      expect(getPlayerCar(race).driverId).toBe(DRIVERS[circuit.round % DRIVERS.length].id);
      const next = advanceLap(race, { pace: 'standard', box: false, compound: getPlayerCar(race).tyre.compound, boost: false });
      expect(next.lap).toBe(1);
    }
  });
});
