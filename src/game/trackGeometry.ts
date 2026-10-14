/**
 * Track outline geometry: turns a list of control points into a smooth closed path
 * (Catmull-Rom converted to cubic Béziers) and provides arc-length sampling so cars
 * can be placed at a fraction of the lap. Pure maths, no DOM required.
 */
import type { CircuitSpec } from './types';

export type Point = { x: number; y: number };

interface Segment {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
}

export interface TrackGeometry {
  path: string;
  length: number;
  pointAt(fraction: number): Point;
  /** Unit tangent at a fraction of the lap (direction of travel). */
  tangentAt(fraction: number): Point;
  /** Offset copy of a section of the track, e.g. for the pit lane. */
  offsetPath(from: number, to: number, offset: number, steps?: number): string;
}

const cache = new Map<string, TrackGeometry>();

function bezier(seg: Segment, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * seg.p0.x + b * seg.c1.x + c * seg.c2.x + d * seg.p1.x,
    y: a * seg.p0.y + b * seg.c1.y + c * seg.c2.y + d * seg.p1.y,
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildTrackGeometry(id: string, points: Array<[number, number]>, tension = 1): TrackGeometry {
  const cached = cache.get(id);
  if (cached) return cached;

  const pts = points.map(([x, y]) => ({ x, y }));
  const n = pts.length;
  const segments: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    segments.push({
      p0: p1,
      c1: { x: p1.x + ((p2.x - p0.x) / 6) * tension, y: p1.y + ((p2.y - p0.y) / 6) * tension },
      c2: { x: p2.x - ((p3.x - p1.x) / 6) * tension, y: p2.y - ((p3.y - p1.y) / 6) * tension },
      p1: p2,
    });
  }

  const path =
    `M${r1(segments[0].p0.x)} ${r1(segments[0].p0.y)}` +
    segments.map((s) => `C${r1(s.c1.x)} ${r1(s.c1.y)} ${r1(s.c2.x)} ${r1(s.c2.y)} ${r1(s.p1.x)} ${r1(s.p1.y)}`).join('') +
    'Z';

  // Arc-length lookup table.
  const STEPS = Math.max(4, Math.round(480 / n));
  const lut: Array<{ s: number; p: Point }> = [];
  let total = 0;
  let prev = segments[0].p0;
  lut.push({ s: 0, p: prev });
  for (const seg of segments) {
    for (let k = 1; k <= STEPS; k++) {
      const p = bezier(seg, k / STEPS);
      total += Math.hypot(p.x - prev.x, p.y - prev.y);
      lut.push({ s: total, p });
      prev = p;
    }
  }

  const pointAt = (fraction: number): Point => {
    const f = ((fraction % 1) + 1) % 1;
    const target = f * total;
    let lo = 0;
    let hi = lut.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lut[mid].s < target) lo = mid + 1;
      else hi = mid;
    }
    const b = lut[lo];
    const a = lut[Math.max(0, lo - 1)];
    const span = b.s - a.s || 1;
    const t = (target - a.s) / span;
    return { x: a.p.x + (b.p.x - a.p.x) * t, y: a.p.y + (b.p.y - a.p.y) * t };
  };

  const tangentAt = (fraction: number): Point => {
    const a = pointAt(fraction - 0.002);
    const b = pointAt(fraction + 0.002);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  };

  const offsetPath = (from: number, to: number, offset: number, steps = 24) => {
    const parts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const f = from + ((to - from) * i) / steps;
      const p = pointAt(f);
      const t = tangentAt(f);
      // Normal pointing to the right of the direction of travel.
      const x = p.x - t.y * offset;
      const y = p.y + t.x * offset;
      parts.push(`${i === 0 ? 'M' : 'L'}${r1(x)} ${r1(y)}`);
    }
    return parts.join('');
  };

  const geometry: TrackGeometry = { path, length: total, pointAt, tangentAt, offsetPath };
  cache.set(id, geometry);
  return geometry;
}

/** Geometry for a circuit's outline (cached per circuit). */
export function circuitGeometry(circuit: CircuitSpec): TrackGeometry {
  return buildTrackGeometry(circuit.id, circuit.outline);
}
