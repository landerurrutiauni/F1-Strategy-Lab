import type { DriverSpec, TeamSpec } from '../types';

/**
 * The 2026 Formula 1 grid: teams, drivers, car numbers and race engineers.
 *
 * Names are used only to identify the real teams and people this unofficial fan game
 * simulates; no logos or official assets are included. Team colours are approximations.
 * Car pace, driver skill and strategy profiles are illustrative game ratings loosely
 * inspired by the 2026 season form, not official or measured data, and the strategy
 * profiles describe how the in-game AI behaves, not how the real teams operate.
 */
const BASE_TEAMS_LIST: TeamSpec[] = [
  { id: 'mercedes', name: 'Mercedes', short: 'MER', color: '#00d7b6', profile: 'adaptive', carPace: -0.55, approach: 'Adaptive: reacts to degradation, weather and Safety Cars.' },
  { id: 'ferrari', name: 'Ferrari', short: 'FER', color: '#ff2d45', profile: 'balanced', carPace: -0.42, approach: 'Balanced: follows a sensible plan and rarely deviates.' },
  { id: 'mclaren', name: 'McLaren', short: 'MCL', color: '#ff8000', profile: 'adaptive', carPace: -0.34, approach: 'Adaptive: reacts to degradation, weather and Safety Cars.' },
  { id: 'redbull', name: 'Red Bull Racing', short: 'RBR', color: '#4a7dff', profile: 'aggressive', carPace: -0.32, approach: 'Aggressive: pushes hard, favours softs and early stops.' },
  { id: 'racingbulls', name: 'Racing Bulls', short: 'RB', color: '#a9c0ff', profile: 'aggressive', carPace: -0.05, approach: 'Aggressive: pushes hard, favours softs and early stops.' },
  { id: 'alpine', name: 'Alpine', short: 'ALP', color: '#ff87bc', profile: 'balanced', carPace: 0.05, approach: 'Balanced: follows a sensible plan and rarely deviates.' },
  { id: 'haas', name: 'Haas', short: 'HAA', color: '#b6babd', profile: 'conservative', carPace: 0.18, approach: 'Conservative: protects tyres and extends stints.' },
  { id: 'audi', name: 'Audi', short: 'AUD', color: '#e8e2d6', profile: 'conservative', carPace: 0.22, approach: 'Conservative: protects tyres and extends stints.' },
  { id: 'williams', name: 'Williams', short: 'WIL', color: '#37bedd', profile: 'balanced', carPace: 0.28, approach: 'Balanced: follows a sensible plan and rarely deviates.' },
  { id: 'astonmartin', name: 'Aston Martin', short: 'AMR', color: '#229971', profile: 'conservative', carPace: 0.35, approach: 'Conservative: protects tyres and extends stints.' },
  { id: 'cadillac', name: 'Cadillac', short: 'CAD', color: '#c9b37e', profile: 'conservative', carPace: 0.55, approach: 'Conservative: protects tyres and extends stints.' },
];

const d = (
  id: string,
  teamId: string,
  name: string,
  code: string,
  number: number,
  engineer: string,
  skill: number,
  errorProneness = 1,
  tyreSmoothness = 1,
  consistency = 0.15,
): DriverSpec => ({ id, teamId, name, code, number, engineer, skill, errorProneness, tyreSmoothness, consistency });

const BASE_DRIVERS_LIST: DriverSpec[] = [
  d('rus', 'mercedes', 'George Russell', 'RUS', 63, 'Marcus Dudley', -0.08, 0.9, 0.98, 0.13),
  d('ant', 'mercedes', 'Kimi Antonelli', 'ANT', 12, 'Peter Bonnington', -0.08, 1.1, 1, 0.16),
  d('lec', 'ferrari', 'Charles Leclerc', 'LEC', 16, 'Bryan Bozzi', -0.1, 1, 1, 0.14),
  d('ham', 'ferrari', 'Lewis Hamilton', 'HAM', 44, 'Carlo Santi', -0.05, 0.85, 0.94, 0.14),
  d('nor', 'mclaren', 'Lando Norris', 'NOR', 1, 'Will Joseph', -0.1, 0.95, 0.97, 0.14),
  d('pia', 'mclaren', 'Oscar Piastri', 'PIA', 81, 'Tom Stallard', -0.08, 0.9, 0.96, 0.13),
  d('ver', 'redbull', 'Max Verstappen', 'VER', 3, 'Gianpiero Lambiase', -0.16, 0.85, 0.97, 0.12),
  d('had', 'redbull', 'Isack Hadjar', 'HAD', 6, 'Richard Wood', 0, 1.15, 1.02, 0.16),
  d('law', 'racingbulls', 'Liam Lawson', 'LAW', 30, 'Alexandre Iliopoulos', 0, 1.1, 1.01, 0.16),
  d('lin', 'racingbulls', 'Arvid Lindblad', 'LIN', 41, 'Pierre Hamelin', 0.05, 1.25, 1.03, 0.18),
  d('gas', 'alpine', 'Pierre Gasly', 'GAS', 10, 'Josh Peckett', -0.02, 0.95, 0.99, 0.15),
  d('col', 'alpine', 'Franco Colapinto', 'COL', 43, 'Stuart Barlow', 0.06, 1.2, 1.02, 0.17),
  d('oco', 'haas', 'Esteban Ocon', 'OCO', 31, 'Laura Müller', 0, 1, 0.98, 0.15),
  d('bea', 'haas', 'Oliver Bearman', 'BEA', 87, 'Ronan O’Hare', -0.01, 1.1, 1.01, 0.16),
  d('hul', 'audi', 'Nico Hülkenberg', 'HUL', 27, 'Steven Petrik', 0, 0.9, 0.97, 0.14),
  d('bor', 'audi', 'Gabriel Bortoleto', 'BOR', 5, 'José Manuel López', 0.02, 1.05, 1, 0.16),
  d('alb', 'williams', 'Alex Albon', 'ALB', 23, 'James Urwin', -0.02, 0.95, 0.97, 0.14),
  d('sai', 'williams', 'Carlos Sainz', 'SAI', 55, 'Gaëtan Jego', -0.03, 0.95, 0.98, 0.14),
  d('alo', 'astonmartin', 'Fernando Alonso', 'ALO', 14, 'Andrew Vizard', -0.06, 0.85, 0.95, 0.13),
  d('str', 'astonmartin', 'Lance Stroll', 'STR', 18, 'Gary Gannon', 0.08, 1.15, 1.02, 0.17),
  d('per', 'cadillac', 'Sergio Pérez', 'PER', 11, 'Carlo Pasetti', 0.02, 1, 0.94, 0.15),
  d('bot', 'cadillac', 'Valtteri Bottas', 'BOT', 77, 'John Howard', 0.02, 0.95, 0.98, 0.14),
];

export const DEFAULT_PLAYER_DRIVER_ID = 'nor';

/** The eleven real 2026 teams and their 22 drivers, without any team created by the player. */
export const BASE_TEAMS: readonly TeamSpec[] = BASE_TEAMS_LIST;
export const BASE_DRIVERS: readonly DriverSpec[] = BASE_DRIVERS_LIST;

/**
 * The grid in use: the real teams plus, during a career with a team of your own, that team as
 * the twelfth entry. The arrays are updated in place so every module sees the same grid.
 */
export const TEAMS: TeamSpec[] = [...BASE_TEAMS_LIST];
export const DRIVERS: DriverSpec[] = [...BASE_DRIVERS_LIST];

let teamById = new Map(TEAMS.map((t) => [t.id, t]));
let driverById = new Map(DRIVERS.map((dr) => [dr.id, dr]));

/** Adds a team created by the player to the grid (or removes it with null). */
export function setExtraTeam(extra: { team: TeamSpec; drivers: DriverSpec[] } | null): void {
  TEAMS.splice(0, TEAMS.length, ...BASE_TEAMS_LIST, ...(extra ? [extra.team] : []));
  DRIVERS.splice(0, DRIVERS.length, ...BASE_DRIVERS_LIST, ...(extra ? extra.drivers : []));
  teamById = new Map(TEAMS.map((t) => [t.id, t]));
  driverById = new Map(DRIVERS.map((dr) => [dr.id, dr]));
}

export function getTeam(id: string): TeamSpec {
  const team = teamById.get(id);
  if (!team) throw new Error(`Unknown team: ${id}`);
  return team;
}

export function getDriver(id: string): DriverSpec {
  const driver = driverById.get(id);
  if (!driver) throw new Error(`Unknown driver: ${id}`);
  return driver;
}

export function isDriverId(id: unknown): id is string {
  return typeof id === 'string' && driverById.has(id);
}

export function driversOfTeam(teamId: string): DriverSpec[] {
  return DRIVERS.filter((dr) => dr.teamId === teamId);
}
