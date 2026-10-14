/**
 * Continuous playback of a race. The engine works lap by lap; this module turns each car's
 * lap records into a timeline so the map can show every car at any moment of race time:
 * pulling away from the grid, running at its own lap pace, diving into the pit lane and
 * stopping at its box, retiring, and taking the flag. Pure functions, no DOM.
 */
import { getCircuit } from './data/circuits';
import type { RaceState } from './types';

/** Where the pit lane leaves the track and where the car stops, as fractions of a lap. */
export const PIT_ENTRY = 0.93;
export const PIT_BOX = 0.975;
/** The first part of the next lap is still the pit exit road. */
export const PIT_EXIT = 0.06;
/** Spacing between grid slots on the map (fraction of a lap). */
export const GRID_SLOT = 0.007;

export interface LapSegment {
  lap: number;
  /** Race time (s) when the car starts this lap and when it crosses the line at its end. */
  start: number;
  end: number;
  /** Track fraction at `start` (negative on the grid for lap 1). */
  from: number;
  /** In-lap of a pit stop: time on track without the stop, and the stationary time. */
  pit?: { raw: number; stationary: number };
  /** The lap after a stop starts on the pit exit road. */
  outLap: boolean;
}

export interface CarTimeline {
  id: string;
  segments: LapSegment[];
  /** Set when the car retired: it stops on track at `stopAt` (fraction of its last lap). */
  retired: { lap: number; stopAt: number; lapTime: number } | null;
  /** Number of laps after which the car takes the flag (null while the race runs). */
  finishLap: number | null;
  /** Grid slot (0-based), used to park finished cars side by side. */
  slot: number;
}

export type CarPhase = 'grid' | 'racing' | 'pit' | 'stopped' | 'finished';

export interface CarPosition {
  /** Laps covered, e.g. 3.25 = a quarter into lap 4. */
  distance: number;
  /** Track fraction for drawing (0..1). */
  fraction: number;
  phase: CarPhase;
  /** On the pit-lane path rather than the racing line. */
  inPit: boolean;
}

/** Small deterministic hash so a retired car always stops at the same spot. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function buildTimelines(state: RaceState): CarTimeline[] {
  const refLap = getCircuit(state.config.circuitId).baseLapTime;
  const finishLaps = new Map((state.classification ?? []).filter((e) => e.status === 'finished').map((e) => [e.carId, e.lapsCompleted]));
  return state.cars.map((car) => {
    const slot = car.gridPosition - 1;
    const segments: LapSegment[] = [];
    let start = 0;
    let previousPitted = false;
    for (const record of car.laps) {
      const stop = record.pitted ? car.pitStops.find((p) => p.lap === record.lap) : undefined;
      segments.push({
        lap: record.lap,
        start,
        end: record.elapsed,
        from: record.lap === 1 ? -slot * GRID_SLOT : 0,
        pit: stop ? { raw: Math.max(record.lapTime * 0.5, record.lapTime - stop.totalLoss), stationary: stop.stationaryTime } : undefined,
        outLap: previousPitted,
      });
      start = record.elapsed;
      previousPitted = record.pitted;
    }
    const lastTime = car.laps.length ? car.laps[car.laps.length - 1].lapTime : refLap + 2.6;
    return {
      id: car.id,
      segments,
      retired: car.status === 'retired' ? { lap: (car.retiredLap ?? car.laps.length + 1), stopAt: 0.2 + 0.7 * hash(car.id), lapTime: lastTime } : null,
      finishLap: finishLaps.get(car.id) ?? null,
      slot,
    };
  });
}

/** Fraction of a lap covered after `u` (0..1) of the lap's time, including a pit stop. */
function lapProgress(seg: LapSegment, u: number): { fraction: number; inPit: boolean; stopped: boolean } {
  const span = 1 - seg.from;
  if (!seg.pit) {
    const fraction = seg.from + span * u;
    return { fraction, inPit: seg.outLap && fraction < PIT_EXIT, stopped: false };
  }
  // On track at racing speed up to the pit entry, then the pit lane with the stationary stop.
  const total = seg.end - seg.start;
  const t = u * total;
  const toEntry = ((PIT_ENTRY - seg.from) / span) * seg.pit.raw;
  if (t <= toEntry) {
    const fraction = seg.from + (PIT_ENTRY - seg.from) * (t / toEntry);
    return { fraction, inPit: seg.outLap && fraction < PIT_EXIT, stopped: false };
  }
  const laneTime = Math.max(0.1, total - toEntry - seg.pit.stationary);
  const toBox = laneTime * ((PIT_BOX - PIT_ENTRY) / (1 - PIT_ENTRY));
  const inLane = t - toEntry;
  if (inLane <= toBox) return { fraction: PIT_ENTRY + (PIT_BOX - PIT_ENTRY) * (inLane / toBox), inPit: true, stopped: false };
  if (inLane <= toBox + seg.pit.stationary) return { fraction: PIT_BOX, inPit: true, stopped: true };
  const after = (inLane - toBox - seg.pit.stationary) / Math.max(0.1, laneTime - toBox);
  return { fraction: PIT_BOX + (1 - PIT_BOX) * Math.min(1, after), inPit: true, stopped: false };
}

/** Where a car is at race time `t` (s). */
export function positionAt(tl: CarTimeline, t: number): CarPosition {
  const segs = tl.segments;
  const lastIndex = tl.finishLap !== null ? Math.min(segs.length, tl.finishLap) - 1 : segs.length - 1;

  if (t <= 0) {
    const from = segs[0]?.from ?? -tl.slot * GRID_SLOT;
    return { distance: from, fraction: from, phase: 'grid', inPit: false };
  }

  for (let i = 0; i <= lastIndex; i++) {
    const seg = segs[i];
    if (t < seg.end) {
      const u = Math.max(0, (t - seg.start) / Math.max(0.001, seg.end - seg.start));
      const p = lapProgress(seg, u);
      return { distance: seg.lap - 1 + p.fraction, fraction: p.fraction, phase: p.inPit ? 'pit' : 'racing', inPit: p.inPit };
    }
  }

  const done = lastIndex >= 0 ? segs[lastIndex] : null;
  const doneEnd = done?.end ?? 0;
  const lapsDone = done?.lap ?? 0;

  if (tl.finishLap !== null && lapsDone >= tl.finishLap) {
    // Took the flag: cruise to a stop just past the line, side by side with the others.
    const parked = 0.02 + (tl.slot % 11) * 0.004;
    const k = Math.min(1, (t - doneEnd) / 6);
    return { distance: lapsDone + parked * k, fraction: parked * k, phase: 'finished', inPit: false };
  }

  if (tl.retired) {
    // Carries on at its last pace, then stops where it broke down or went off.
    const covered = (t - doneEnd) / tl.retired.lapTime;
    const fraction = Math.min(tl.retired.stopAt, Math.max(0, covered));
    return { distance: lapsDone + fraction, fraction, phase: covered >= tl.retired.stopAt ? 'stopped' : 'racing', inPit: false };
  }

  // No data yet for the next lap (the race is paused at the line): wait on the line.
  return { distance: lapsDone, fraction: 0, phase: 'racing', inPit: false };
}

/** Race time when the leader completes `lap` (0 = the start). */
export function lineTime(state: RaceState, lap: number): number {
  if (lap <= 0) return 0;
  let best = Infinity;
  for (const car of state.cars) {
    const record = car.laps[lap - 1];
    if (record && record.lap === lap && record.elapsed < best) best = record.elapsed;
  }
  return Number.isFinite(best) ? best : 0;
}

/** Race time when the last classified car takes the flag. */
export function finishTime(state: RaceState): number {
  let last = 0;
  for (const entry of state.classification ?? []) {
    if (entry.status !== 'finished') continue;
    const car = state.cars.find((c) => c.id === entry.carId);
    const record = car?.laps[entry.lapsCompleted - 1];
    if (record && record.elapsed > last) last = record.elapsed;
  }
  return last;
}

/** Live running order from the cars' positions (retired cars last). */
export function liveOrder(timelines: CarTimeline[], t: number): string[] {
  return timelines
    .map((tl) => ({ tl, p: positionAt(tl, t) }))
    .sort((a, b) => {
      const ra = a.p.phase === 'stopped' ? 1 : 0;
      const rb = b.p.phase === 'stopped' ? 1 : 0;
      return ra - rb || b.p.distance - a.p.distance;
    })
    .map(({ tl }) => tl.id);
}
