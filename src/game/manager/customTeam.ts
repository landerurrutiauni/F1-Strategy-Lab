/**
 * A team of your own for the Team Principal career, joining the 2026 grid as its twelfth entry
 * (24 cars). You choose the name, livery colour, power unit, car concept, starting level and
 * both drivers. Every rating and amount here is illustrative, chosen for gameplay.
 */
import { BASE_DRIVERS, BASE_TEAMS, setExtraTeam } from '../data/teams';
import type { DriverSpec, TeamSpec } from '../types';
import type { CarStats } from './carStats';

export const CUSTOM_TEAM_ID = 'custom';
export const CUSTOM_DRIVER_IDS = ['custom-1', 'custom-2'] as const;

export type TeamLevel = 'startup' | 'midfield' | 'contender';
export type CarConcept = 'balanced' | 'lowDrag' | 'highDownforce' | 'tyreFriendly';
export type PowerUnit = 'mercedes' | 'ferrari' | 'honda' | 'redbullford' | 'audi';
export type DriverExperience = 'veteran' | 'rookie';

export interface CustomDriverInput {
  name: string;
  /** Three-letter timing code. */
  code: string;
  number: number;
  engineer: string;
  experience: DriverExperience;
}

export interface CustomTeamInput {
  name: string;
  /** Three-letter short name. */
  short: string;
  /** Livery colour as #rrggbb. */
  color: string;
  powerUnit: PowerUnit;
  concept: CarConcept;
  level: TeamLevel;
  drivers: [CustomDriverInput, CustomDriverInput];
}

export interface LevelSpec {
  name: string;
  detail: string;
  /** Car pace (s/lap, negative is faster), as for the real teams. */
  carPace: number;
  tier: 'top' | 'mid' | 'works';
  balance: number;
  sponsorIncome: number;
  salaries: number;
  /** Facility level (the simulator one lower for a new entry). */
  facilities: number;
  reliability: number;
}

export const TEAM_LEVELS: Record<TeamLevel, LevelSpec> = {
  startup: {
    name: 'New entry',
    detail: 'A brand-new team: the slowest car and a basic factory, but a big launch budget.',
    carPace: 0.62,
    tier: 'works',
    balance: 80,
    sponsorIncome: 6.5,
    salaries: 0.9,
    facilities: 2,
    reliability: 0.4,
  },
  midfield: {
    name: 'Established investors',
    detail: 'Bought an existing operation: a midfield car, a solid factory and a normal budget.',
    carPace: 0.12,
    tier: 'mid',
    balance: 55,
    sponsorIncome: 7.5,
    salaries: 1.2,
    facilities: 3,
    reliability: 0.55,
  },
  contender: {
    name: 'Manufacturer works team',
    detail: 'A car maker goes racing: a front-running car, top facilities and high expectations.',
    carPace: -0.3,
    tier: 'top',
    balance: 65,
    sponsorIncome: 9.5,
    salaries: 2.5,
    facilities: 4,
    reliability: 0.65,
  },
};

export const CAR_CONCEPTS: Record<CarConcept, { name: string; detail: string; character: Partial<CarStats> }> = {
  balanced: { name: 'Balanced', detail: 'No weak spot, no standout strength.', character: {} },
  lowDrag: {
    name: 'Low drag',
    detail: 'Quick on the straights, harder work in slow corners.',
    character: { straightLine: 5, highSpeed: 1, lowSpeed: -4, mediumSpeed: -2, tyreCare: -1 },
  },
  highDownforce: {
    name: 'High downforce',
    detail: 'Strong in slow and medium corners, slow on the straights.',
    character: { lowSpeed: 3, mediumSpeed: 3, straightLine: -6, tyreCare: 1 },
  },
  tyreFriendly: {
    name: 'Tyre friendly',
    detail: 'Gentle on the tyres for longer stints, a little less raw pace.',
    character: { tyreCare: 6, lowSpeed: 1, mediumSpeed: 1, highSpeed: -1, straightLine: -1 },
  },
};

/** 2026 power-unit suppliers. Effects are illustrative game values, not measured data. */
export const POWER_UNITS: Record<PowerUnit, { name: string; straightLine: number; reliability: number }> = {
  mercedes: { name: 'Mercedes', straightLine: 2, reliability: 0.06 },
  ferrari: { name: 'Ferrari', straightLine: 1, reliability: 0.04 },
  honda: { name: 'Honda', straightLine: 1, reliability: 0 },
  redbullford: { name: 'Red Bull Ford', straightLine: 2, reliability: -0.06 },
  audi: { name: 'Audi', straightLine: 0, reliability: -0.06 },
};

export const DRIVER_EXPERIENCE: Record<DriverExperience, { name: string; detail: string; skill: number; errorProneness: number; tyreSmoothness: number; consistency: number }> = {
  veteran: { name: 'Experienced', detail: 'Consistent, rarely makes mistakes, kind to the tyres.', skill: -0.03, errorProneness: 0.92, tyreSmoothness: 0.97, consistency: 0.14 },
  rookie: { name: 'Rookie', detail: 'Raw talent: a bit slower and more error-prone for now.', skill: 0.04, errorProneness: 1.15, tyreSmoothness: 1.02, consistency: 0.17 },
};

/** Livery colours that stand apart from the real teams' colours on the dark pit wall. */
export const LIVERY_COLORS = ['#a06cff', '#ff4fd8', '#ffd23f', '#ff6b2c', '#29b6ff', '#5ef0a0', '#d7263d', '#f4f4f4'];

/** A ready-to-race example (fictional names) the player can edit. */
export const DEFAULT_CUSTOM_TEAM: CustomTeamInput = {
  name: 'Phoenix Racing',
  short: 'PHX',
  color: '#a06cff',
  powerUnit: 'mercedes',
  concept: 'balanced',
  level: 'midfield',
  drivers: [
    { name: 'Alex Rivera', code: 'RIV', number: 7, engineer: 'Jamie Hart', experience: 'veteran' },
    { name: 'Sam Okafor', code: 'OKA', number: 28, engineer: 'Nadia Costa', experience: 'rookie' },
  ],
};

const HEX = /^#[0-9a-f]{6}$/i;
const CODE = /^[A-Z]{3}$/;

/** Three capital letters from a name: the start of the surname, or of the only word. */
export function suggestCode(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[^A-Za-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const base = (words[words.length - 1] ?? '').toUpperCase();
  return (base + 'XXX').slice(0, 3);
}

/** Problems with a team design, in plain words; empty when it is ready to race. */
export function customTeamProblems(input: CustomTeamInput | null | undefined): string[] {
  if (!input || typeof input !== 'object') return ['Design your team first.'];
  const problems: string[] = [];
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 2 || name.length > 28) problems.push('The team name needs 2 to 28 characters.');
  else if (BASE_TEAMS.some((t) => t.name.toLowerCase() === name.toLowerCase())) problems.push('That team name is already on the grid.');
  if (typeof input.short !== 'string' || !CODE.test(input.short)) problems.push('The short name must be three capital letters.');
  else if (BASE_TEAMS.some((t) => t.short === input.short)) problems.push(`${input.short} is already used by another team.`);
  if (typeof input.color !== 'string' || !HEX.test(input.color)) problems.push('Choose a livery colour.');
  if (!(input.powerUnit in POWER_UNITS)) problems.push('Choose a power unit.');
  if (!(input.concept in CAR_CONCEPTS)) problems.push('Choose a car concept.');
  if (!(input.level in TEAM_LEVELS)) problems.push('Choose a starting level.');
  if (!Array.isArray(input.drivers) || input.drivers.length !== 2) return [...problems, 'Sign two drivers.'];
  const takenNumbers = new Set(BASE_DRIVERS.map((d) => d.number));
  const takenCodes = new Set(BASE_DRIVERS.map((d) => d.code));
  input.drivers.forEach((d, i) => {
    const label = `Driver ${i + 1}`;
    const dName = typeof d?.name === 'string' ? d.name.trim() : '';
    if (dName.length < 2 || dName.length > 32) problems.push(`${label}: the name needs 2 to 32 characters.`);
    if (typeof d?.code !== 'string' || !CODE.test(d.code)) problems.push(`${label}: the timing code must be three capital letters.`);
    else if (takenCodes.has(d.code)) problems.push(`${label}: ${d.code} is already used by another driver.`);
    if (!Number.isInteger(d?.number) || d.number < 1 || d.number > 99) problems.push(`${label}: the car number must be between 1 and 99.`);
    else if (takenNumbers.has(d.number)) problems.push(`${label}: number ${d.number} is already taken.`);
    const engineer = typeof d?.engineer === 'string' ? d.engineer.trim() : '';
    if (engineer.length < 2 || engineer.length > 32) problems.push(`${label}: the race engineer's name needs 2 to 32 characters.`);
    if (!(d?.experience in DRIVER_EXPERIENCE)) problems.push(`${label}: choose the experience.`);
  });
  const [a, b] = input.drivers;
  if (a?.code && a.code === b?.code) problems.push('Your drivers need different timing codes.');
  if (a?.number && a.number === b?.number) problems.push('Your drivers need different car numbers.');
  return problems;
}

/** The team and drivers as the race engine sees them. */
export function buildCustomRoster(input: CustomTeamInput): { team: TeamSpec; drivers: DriverSpec[] } {
  const level = TEAM_LEVELS[input.level];
  const team: TeamSpec = {
    id: CUSTOM_TEAM_ID,
    name: input.name.trim(),
    short: input.short,
    color: input.color.toLowerCase(),
    profile: 'balanced',
    carPace: level.carPace,
    approach: 'Balanced: follows a sensible plan and rarely deviates.',
  };
  const drivers = input.drivers.map((d, i): DriverSpec => {
    const xp = DRIVER_EXPERIENCE[d.experience];
    return {
      id: CUSTOM_DRIVER_IDS[i],
      teamId: CUSTOM_TEAM_ID,
      name: d.name.trim(),
      code: d.code,
      number: d.number,
      engineer: d.engineer.trim(),
      skill: xp.skill,
      errorProneness: xp.errorProneness,
      tyreSmoothness: xp.tyreSmoothness,
      consistency: xp.consistency,
    };
  });
  return { team, drivers };
}

let active: CustomTeamInput | null = null;

/** Puts your team on the grid for this career, or takes it off with null. */
export function activateCustomTeam(input: CustomTeamInput | null | undefined): void {
  active = input && customTeamProblems(input).length === 0 ? input : null;
  setExtraTeam(active ? buildCustomRoster(active) : null);
}

/** The design of the team on the grid, when it is yours (null for a real team). */
export function customTeamFor(teamId: string): CustomTeamInput | null {
  return teamId === CUSTOM_TEAM_ID ? active : null;
}

/** Car character (rating offsets) of a custom design: its concept plus the power unit. */
export function customCharacter(input: CustomTeamInput): Partial<CarStats> {
  const character = { ...CAR_CONCEPTS[input.concept].character };
  character.straightLine = (character.straightLine ?? 0) + POWER_UNITS[input.powerUnit].straightLine;
  return character;
}

/** Starting reliability (0–1) of a custom design. */
export function customReliability(input: CustomTeamInput): number {
  return TEAM_LEVELS[input.level].reliability + POWER_UNITS[input.powerUnit].reliability;
}
