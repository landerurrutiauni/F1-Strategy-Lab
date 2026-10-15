/**
 * Car development and facilities for the Team Principal career. Parts are designed and
 * built over calendar weeks; when ready they raise the car's ratings. Facilities speed up
 * design, improve upgrade quality, sharpen setup work and make pit stops quicker.
 * All costs are in millions of US dollars and are illustrative.
 */
import type { Rng } from '../rng';
import { CAR_STATS, type CarStat, type CarStats } from './carStats';

export type PartId = 'frontWing' | 'rearWing' | 'floor' | 'sidepods' | 'suspension';
export type FacilityId = 'windTunnel' | 'cfd' | 'simulator' | 'factory' | 'pitCrew';

export interface PartSpec {
  name: string;
  detail: string;
  /** Share of the upgrade going to each rating. */
  weights: Partial<Record<CarStat, number>>;
  /** Design and build time at level-3 facilities (days). */
  days: number;
  cost: number;
  /** Typical rating points gained. */
  points: number;
}

export const PARTS: Record<PartId, PartSpec> = {
  frontWing: {
    name: 'Front wing',
    detail: 'Balance and grip in slow and medium-speed corners.',
    weights: { lowSpeed: 0.4, mediumSpeed: 0.4, highSpeed: 0.2 },
    days: 21,
    cost: 4,
    points: 3,
  },
  rearWing: {
    name: 'Rear wing',
    detail: 'Less drag on the straights while keeping rear grip in fast corners.',
    weights: { straightLine: 0.6, highSpeed: 0.4 },
    days: 21,
    cost: 4,
    points: 3,
  },
  floor: {
    name: 'Floor',
    detail: 'Ground-effect downforce: the biggest gains in medium and high-speed corners.',
    weights: { mediumSpeed: 0.45, highSpeed: 0.55 },
    days: 35,
    cost: 8,
    points: 6,
  },
  sidepods: {
    name: 'Sidepods',
    detail: 'Cooling and airflow to the rear: straight-line speed and tyre temperatures.',
    weights: { straightLine: 0.6, tyreCare: 0.4 },
    days: 28,
    cost: 6,
    points: 4,
  },
  suspension: {
    name: 'Suspension',
    detail: 'Mechanical grip over kerbs and bumps, and kinder on the tyres.',
    weights: { lowSpeed: 0.5, tyreCare: 0.5 },
    days: 28,
    cost: 5,
    points: 4,
  },
};

export const PART_IDS = Object.keys(PARTS) as PartId[];

export interface FacilitySpec {
  name: string;
  detail: string;
  /** Effect of each level, for the UI. */
  effect: string;
}

export const FACILITIES: Record<FacilityId, FacilitySpec> = {
  windTunnel: { name: 'Wind tunnel', detail: 'Aero testing of new parts.', effect: 'Bigger, more reliable upgrades' },
  cfd: { name: 'CFD cluster', detail: 'Simulated airflow for design work.', effect: 'Faster design, better upgrades' },
  simulator: { name: 'Driver simulator', detail: 'Setup preparation before each weekend.', effect: 'Clearer setup feedback in practice' },
  factory: { name: 'Factory', detail: 'Machining and composites for new parts.', effect: 'Faster builds, more projects at once' },
  pitCrew: { name: 'Pit crew training', detail: 'Practice, equipment and fitness for the crew.', effect: 'Quicker pit stops' },
};

export const FACILITY_IDS = Object.keys(FACILITIES) as FacilityId[];
export const MAX_FACILITY_LEVEL = 5;

export type Facilities = Record<FacilityId, { level: number; upgradeReady?: string }>;

/** Cost (millions) and time (days) to take a facility to the next level. */
export function facilityUpgrade(level: number): { cost: number; days: number } {
  return { cost: 5 + 4 * level, days: 14 + 7 * level };
}

/** Facility levels a team starts with, by how established it is. */
export function initialFacilities(teamId: string): Facilities {
  const tier = TEAM_TIER[teamId] ?? 'mid';
  const base = tier === 'top' ? 4 : tier === 'works' ? 3 : 2;
  return {
    windTunnel: { level: base },
    cfd: { level: base },
    simulator: { level: Math.max(1, base - (tier === 'works' ? 1 : 0)) },
    factory: { level: base },
    pitCrew: { level: base },
  };
}

export const TEAM_TIER: Record<string, 'top' | 'mid' | 'works'> = {
  mercedes: 'top',
  ferrari: 'top',
  mclaren: 'top',
  redbull: 'top',
  racingbulls: 'mid',
  alpine: 'mid',
  haas: 'mid',
  williams: 'mid',
  astonmartin: 'mid',
  audi: 'works',
  cadillac: 'works',
};

export function designDays(part: PartId, f: Facilities): number {
  const speed = 1 + 0.07 * (f.cfd.level - 3) + 0.08 * (f.factory.level - 3);
  return Math.max(7, Math.round(PARTS[part].days / speed));
}

export function maxProjects(f: Facilities): number {
  return 1 + Math.ceil(f.factory.level / 2);
}

/** Expected points of an upgrade with these facilities (before luck and diminishing returns). */
export function expectedPoints(part: PartId, f: Facilities): number {
  return PARTS[part].points * (0.75 + 0.06 * f.windTunnel.level + 0.04 * f.cfd.level);
}

/** Diminishing returns: the better a rating already is, the harder it is to improve. */
function headroom(rating: number): number {
  return Math.min(1, Math.max(0.25, (104 - rating) / 35));
}

/**
 * Rating gains from a finished part: luck can make it a dud, and gains shrink as a rating
 * approaches its ceiling.
 */
export function upgradeGains(part: PartId, stats: CarStats, f: Facilities, rng: Rng): Partial<CarStats> {
  const spec = PARTS[part];
  // Correlation with the track: most parts work, some do not.
  const luck = rng.chance(0.12 - 0.015 * f.windTunnel.level) ? rng.range(-0.3, 0.2) : rng.range(0.6, 1.35);
  const total = expectedPoints(part, f) * luck;
  const gains: Partial<CarStats> = {};
  for (const stat of CAR_STATS) {
    const w = spec.weights[stat];
    if (!w) continue;
    gains[stat] = Math.round(total * w * headroom(stats[stat]) * 10) / 10;
  }
  return gains;
}

export function applyGains(stats: CarStats, gains: Partial<CarStats>): CarStats {
  const next = { ...stats };
  for (const stat of CAR_STATS) next[stat] = Math.round(Math.min(99, Math.max(20, next[stat] + (gains[stat] ?? 0))) * 10) / 10;
  return next;
}

/**
 * Rival development between two rounds: bigger teams bring more, and a few upgrades go wrong.
 * Returns the gains and an optional headline for the paddock news.
 */
export function rivalDevelopment(teamId: string, stats: CarStats, rng: Rng): { gains: Partial<CarStats>; total: number } {
  const tier = TEAM_TIER[teamId] ?? 'mid';
  const budget = tier === 'top' ? 1.3 : tier === 'works' ? 1.1 : 0.95;
  const total = rng.chance(0.08) ? -rng.range(0.5, 1.5) : rng.range(0.4, 2.8) * budget;
  const gains: Partial<CarStats> = {};
  const picks = [rng.pick(CAR_STATS), rng.pick(CAR_STATS)];
  for (const stat of picks) gains[stat] = Math.round(((gains[stat] ?? 0) + (total / 2) * headroom(stats[stat])) * 10) / 10;
  return { gains, total };
}

/** Seconds off the stationary time from the pit-crew facility. */
export function pitCrewBonus(f: Facilities): number {
  return 0.12 * (f.pitCrew.level - 3);
}

/** Days between two ISO dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}
