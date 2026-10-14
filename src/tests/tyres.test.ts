import { describe, expect, it } from 'vitest';
import { COMPOUNDS } from '../game/data/tyres';
import { computeLapTime } from '../game/lapTime';
import { getCircuit } from '../game/data/circuits';
import {
  compoundPace,
  degradationPenalty,
  expectedWear,
  failureChance,
  fastestCompoundFor,
  suitabilityGap,
  wetnessPenalty,
} from '../game/tyreModel';

const wearInputs = { pace: 'standard' as const, degradation: 1, wetness: 0, trackTemp: 35, safetyCar: false };

describe('tyre compounds', () => {
  it('have distinct dry pace: soft quickest, hard slowest', () => {
    expect(compoundPace('soft', 0)).toBeLessThan(compoundPace('medium', 0));
    expect(compoundPace('medium', 0)).toBeLessThan(compoundPace('hard', 0));
  });

  it('have distinct wear rates: soft wears fastest, hard slowest', () => {
    const soft = expectedWear({ ...wearInputs, compound: 'soft' });
    const medium = expectedWear({ ...wearInputs, compound: 'medium' });
    const hard = expectedWear({ ...wearInputs, compound: 'hard' });
    expect(soft).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(hard);
  });

  it('every compound has a letter so it never relies on colour alone', () => {
    const letters = Object.values(COMPOUNDS).map((c) => c.letter);
    expect(new Set(letters).size).toBe(5);
  });
});

describe('degradation', () => {
  it('increases the expected lap-time penalty as wear rises', () => {
    let previous = -1;
    for (let wear = 0; wear <= 100; wear += 10) {
      const penalty = degradationPenalty('medium', wear);
      expect(penalty).toBeGreaterThan(previous);
      previous = penalty;
    }
  });

  it('is gradual early and much steeper near the end of the tyre life', () => {
    const early = degradationPenalty('medium', 30) - degradationPenalty('medium', 20);
    const late = degradationPenalty('medium', 95) - degradationPenalty('medium', 85);
    expect(late).toBeGreaterThan(early * 3);
    expect(degradationPenalty('medium', 100)).toBeLessThan(6);
  });

  it('feeds into the lap time model', () => {
    const circuit = getCircuit('sepang');
    const lap = (wear: number) =>
      computeLapTime({ circuit, lapNumber: 5, wetness: 0, tyre: { compound: 'soft', wear, age: 3 }, pace: 'standard', carOffset: 0, boost: false, freshFromPit: false }).total;
    expect(lap(80)).toBeGreaterThan(lap(20) + 1);
  });

  it('caps very high wear and adds failure risk only past 85%', () => {
    expect(failureChance(60)).toBe(0);
    expect(failureChance(86)).toBeGreaterThan(0);
    expect(failureChance(100)).toBeGreaterThan(failureChance(90));
    expect(degradationPenalty('soft', 150)).toBe(degradationPenalty('soft', 100));
  });

  it('pushing wears tyres faster and conserving slower', () => {
    const push = expectedWear({ ...wearInputs, compound: 'medium', pace: 'push' });
    const conserve = expectedWear({ ...wearInputs, compound: 'medium', pace: 'conserve' });
    const standard = expectedWear({ ...wearInputs, compound: 'medium' });
    expect(push).toBeGreaterThan(standard);
    expect(conserve).toBeLessThan(standard);
  });
});

describe('weather and tyre choice', () => {
  it('picks slicks when dry, intermediates when damp and wets in heavy rain', () => {
    expect(['soft', 'medium', 'hard']).toContain(fastestCompoundFor(0));
    expect(fastestCompoundFor(0.4)).toBe('inter');
    expect(fastestCompoundFor(0.9)).toBe('wet');
  });

  it('makes slicks dramatically slower than wets in heavy rain', () => {
    expect(compoundPace('soft', 0.9) - compoundPace('wet', 0.9)).toBeGreaterThan(10);
  });

  it('penalises treaded tyres on a dry track', () => {
    expect(wetnessPenalty('inter', 0)).toBeGreaterThan(2);
    expect(wetnessPenalty('wet', 0)).toBeGreaterThan(wetnessPenalty('inter', 0));
    expect(suitabilityGap('inter', 0)).toBeGreaterThan(2);
  });

  it('overheats intermediates on a drying track', () => {
    const dry = expectedWear({ ...wearInputs, compound: 'inter', wetness: 0 });
    const ideal = expectedWear({ ...wearInputs, compound: 'inter', wetness: 0.45 });
    expect(dry).toBeGreaterThan(ideal * 1.8);
  });
});
