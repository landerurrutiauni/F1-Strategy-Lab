/**
 * Read-only view models derived from the race state for the UI. Pure functions only:
 * nothing here advances the simulation or touches the random-number generator.
 */
import { getCircuit } from './data/circuits';
import { getDriver, getTeam } from './data/teams';
import { wearSmoothness } from './lapTime';
import { circuitWear, degradationPenalty, expectedWear, lapsUntilWear } from './tyreModel';
import type { CarState, RaceState } from './types';

export interface TowerRow {
  car: CarState;
  code: string;
  name: string;
  teamName: string;
  color: string;
  position: number;
  /** Gap to the leader (s), null for the leader or retired cars. */
  gap: number | null;
  /** Gap to the car ahead (s). */
  interval: number | null;
  lapsDown: number;
  /** Positions gained (+) or lost (−) on the last lap. */
  change: number;
  pittedLastLap: boolean;
  retired: boolean;
}

export function towerRows(state: RaceState): TowerRow[] {
  const ordered = [...state.cars].sort((a, b) => a.position - b.position);
  const leader = ordered.find((c) => c.status === 'running') ?? ordered[0];
  const refLap = leader.lastLapTime ?? getCircuit(state.config.circuitId).baseLapTime;
  return ordered.map((car, index) => {
    const driver = getDriver(car.driverId);
    const team = getTeam(car.teamId);
    const retired = car.status === 'retired';
    const gap = !retired && car !== leader ? car.elapsed - leader.elapsed : null;
    const ahead = index > 0 ? ordered[index - 1] : null;
    const interval = !retired && ahead && ahead.status === 'running' ? car.elapsed - ahead.elapsed : null;
    const prevLap = car.laps.length >= 2 ? car.laps[car.laps.length - 2] : null;
    const prevPosition = prevLap ? prevLap.position : car.gridPosition;
    const lastLap = car.laps[car.laps.length - 1];
    return {
      car,
      code: driver.code,
      name: driver.name,
      teamName: team.name,
      color: team.color,
      position: car.position,
      gap,
      interval,
      lapsDown: gap !== null && gap > refLap ? Math.floor(gap / refLap) : 0,
      change: retired || state.lap === 0 ? 0 : prevPosition - car.position,
      pittedLastLap: !!lastLap && lastLap.lap === state.lap && lastLap.pitted,
      retired,
    };
  });
}

/** Map positions: where each running car is on the lap when the leader crosses the line. */
export function mapFractions(state: RaceState): Map<string, number> {
  const running = state.cars.filter((c) => c.status === 'running').sort((a, b) => a.elapsed - b.elapsed);
  const result = new Map<string, number>();
  if (running.length === 0) return result;
  const leader = running[0];
  const refLap = leader.lastLapTime ?? getCircuit(state.config.circuitId).baseLapTime;
  running.forEach((car, index) => {
    // On the grid the real gaps are tiny, so space the cars out like grid slots.
    const gap = state.lap === 0 ? index * 0.007 * refLap : car.elapsed - leader.elapsed;
    result.set(car.id, -(gap / refLap));
  });
  return result;
}

export interface TyreOutlook {
  wearPerLap: number;
  paceLoss: number;
  /** Laps until 80% wear at the selected pace. */
  usefulLaps: number;
  /** Laps until the failure-risk zone (85%). */
  riskLaps: number;
  stintLaps: number;
}

export function tyreOutlook(state: RaceState, car: CarState, pace = car.pace): TyreOutlook {
  const circuit = getCircuit(state.config.circuitId);
  const wearPerLap = expectedWear({
    compound: car.tyre.compound,
    pace,
    degradation: circuitWear(circuit),
    wetness: state.weather.wetness,
    trackTemp: state.weather.trackTemp,
    safetyCar: state.safetyCar.active,
    smoothness: wearSmoothness(car),
  });
  return {
    wearPerLap,
    paceLoss: degradationPenalty(car.tyre.compound, car.tyre.wear),
    usefulLaps: lapsUntilWear(car.tyre.wear, wearPerLap, 80),
    riskLaps: lapsUntilWear(car.tyre.wear, wearPerLap, 85),
    stintLaps: car.tyre.age,
  };
}

/** Events added on the most recent lap, newest first. */
export function latestEvents(state: RaceState) {
  return state.events.filter((e) => e.lap === state.lap).reverse();
}
