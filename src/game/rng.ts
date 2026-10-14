/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * The generator state is a single 32-bit integer stored in the race state, so the
 * same seed and the same sequence of player decisions always produce the same race.
 * Rendering never touches the generator: only the engine advances it.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** True with the given probability. */
  chance(probability: number): boolean;
  /** Normally distributed value (Box–Muller). */
  normal(mean: number, sd: number): number;
  pick<T>(items: readonly T[]): T;
  /** Current internal state, to be stored back into the race state. */
  readonly state: number;
}

export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  const s = Math.floor(Math.abs(seed)) >>> 0;
  return s === 0 ? 1 : s;
}

export function createRng(initialState: number): Rng {
  let state = normalizeSeed(initialState);

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    normal: (mean, sd) => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: (items) => items[Math.floor(next() * items.length)],
    get state() {
      return state;
    },
  };
}

/** Derive an independent sub-seed (e.g. for forecasts) without consuming the main stream. */
export function deriveSeed(seed: number, salt: number): number {
  let h = normalizeSeed(seed) ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return normalizeSeed(h >>> 0);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 900000) + 100000;
}
