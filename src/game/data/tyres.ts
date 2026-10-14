import type { CompoundId, CompoundSpec } from '../types';

/**
 * Fictional tyre compound parameters.
 *
 * Wear rates are per lap of a 5.3 km circuit at average abrasiveness (full race
 * distances): a soft lasts about 20 laps, a medium about 30 and a hard about 40.
 *
 * Slicks (soft / medium / hard) trade outright pace for durability. Treaded tyres
 * (intermediate / wet) are modelled with an "ideal wetness" and a penalty that grows
 * with the square of the mismatch, so they are excellent in their window and poor
 * outside it. Slick grip collapses faster (exponent 1.8 on a steeper coefficient).
 */
export const COMPOUNDS: Record<CompoundId, CompoundSpec> = {
  soft: {
    id: 'soft',
    name: 'Soft',
    letter: 'S',
    slick: true,
    dryPaceOffset: 0,
    baseWear: 3.9,
    degSensitivity: 1.15,
    warmUpPenalty: 0.2,
    idealWetness: 0,
    drierPenalty: 0,
    wetterPenalty: 19,
    mismatchExponent: 1.8,
    allocation: 2,
    colorVar: 'var(--tyre-soft)',
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    letter: 'M',
    slick: true,
    dryPaceOffset: 0.45,
    baseWear: 2.6,
    degSensitivity: 1,
    warmUpPenalty: 0.35,
    idealWetness: 0,
    drierPenalty: 0,
    wetterPenalty: 20,
    mismatchExponent: 1.8,
    allocation: 2,
    colorVar: 'var(--tyre-medium)',
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    letter: 'H',
    slick: true,
    dryPaceOffset: 0.85,
    baseWear: 1.8,
    degSensitivity: 0.9,
    warmUpPenalty: 0.6,
    idealWetness: 0,
    drierPenalty: 0,
    wetterPenalty: 22,
    mismatchExponent: 1.8,
    allocation: 2,
    colorVar: 'var(--tyre-hard)',
  },
  inter: {
    id: 'inter',
    name: 'Intermediate',
    letter: 'I',
    slick: false,
    dryPaceOffset: 0,
    baseWear: 2.4,
    degSensitivity: 1,
    warmUpPenalty: 0.3,
    idealWetness: 0.45,
    drierPenalty: 16.8,
    wetterPenalty: 29.7,
    mismatchExponent: 2,
    allocation: 3,
    colorVar: 'var(--tyre-inter)',
  },
  wet: {
    id: 'wet',
    name: 'Wet',
    letter: 'W',
    slick: false,
    dryPaceOffset: 0,
    baseWear: 2,
    degSensitivity: 0.9,
    warmUpPenalty: 0.3,
    idealWetness: 0.85,
    drierPenalty: 9,
    wetterPenalty: 20,
    mismatchExponent: 2,
    allocation: 2,
    colorVar: 'var(--tyre-wet)',
  },
};

export const COMPOUND_ORDER: CompoundId[] = ['soft', 'medium', 'hard', 'inter', 'wet'];
export const DRY_COMPOUNDS: CompoundId[] = ['soft', 'medium', 'hard'];

export function isCompoundId(value: unknown): value is CompoundId {
  return typeof value === 'string' && value in COMPOUNDS;
}
