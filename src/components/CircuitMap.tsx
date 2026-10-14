import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { PIT_ENTRY, PIT_EXIT, positionAt, type CarTimeline } from '../game/replay';
import { circuitGeometry } from '../game/trackGeometry';
import type { CircuitSpec } from '../game/types';

/** Live mode: cars are placed every frame from their timelines at the playback's race time. */
export interface LiveFeed {
  subscribe(listener: (time: number) => void): () => void;
  timelines(): CarTimeline[];
  /** Laps run behind the Safety Car (lap number → true). */
  safetyCarLap(lap: number): boolean;
}

/** Sideways distance of the pit lane from the racing line (map units). */
const PIT_OFFSET = -15;

export interface MapCar {
  id: string;
  code: string;
  color: string;
  position: number;
  isPlayer: boolean;
  /** Fraction of a lap (0 = start/finish line, increasing in the racing direction). */
  fraction: number;
  inPit?: boolean;
}

interface CircuitMapProps {
  circuit: CircuitSpec;
  cars?: MapCar[];
  /** Changes every lap; triggers the lap animation. */
  lapKey?: number;
  safetyCar?: boolean;
  reducedMotion?: boolean;
  variant?: 'race' | 'preview' | 'thumb' | 'hero';
  title?: string;
  className?: string;
  live?: LiveFeed;
}

const ANIMATION_MS = 1500;

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Original vector illustration of a circuit with live car markers.
 * Car positions are animated imperatively (refs + requestAnimationFrame) so a lap
 * advance does not re-render React on every frame.
 */
export const CircuitMap = memo(function CircuitMap({
  circuit,
  cars = [],
  lapKey = 0,
  safetyCar = false,
  reducedMotion = false,
  variant = 'race',
  title,
  className,
  live,
}: CircuitMapProps) {
  const geometry = useMemo(() => circuitGeometry(circuit), [circuit]);
  const carRefs = useRef(new Map<string, SVGGElement>());
  const scRef = useRef<SVGGElement>(null);
  const lastFractions = useRef(new Map<string, number>());
  const lastLapKey = useRef(lapKey);
  const frame = useRef<number | null>(null);

  const start = geometry.pointAt(0);
  const startTangent = geometry.tangentAt(0);
  const pitPath = useMemo(() => geometry.offsetPath(-0.07, 0.06, -15), [geometry]);
  const leaderFraction = cars.length ? Math.max(...cars.filter((c) => c.position === 1).map((c) => c.fraction), 0) : 0;

  const place = (el: SVGGElement | null | undefined, fraction: number) => {
    if (!el) return;
    const p = geometry.pointAt(fraction);
    el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
  };

  // Live mode: every car is drawn where its timeline puts it at the current race time.
  const posRefs = useRef(new Map<string, SVGTextElement>());
  useLayoutEffect(() => {
    if (!live) return;
    let lastDraw = -Infinity;
    const draw = (time: number) => {
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      // With reduced motion the cars still move, but jump once a second instead of gliding.
      if (reducedMotion && now - lastDraw < 1000 && lastDraw !== -Infinity) return;
      lastDraw = now;
      const placed = live.timelines().map((tl) => ({ id: tl.id, p: positionAt(tl, time) }));
      const order = [...placed].sort((a, b) => Number(a.p.phase === 'stopped') - Number(b.p.phase === 'stopped') || b.p.distance - a.p.distance);
      order.forEach((car, i) => {
        const label = posRefs.current.get(car.id);
        if (label && label.textContent !== String(i + 1)) label.textContent = String(i + 1);
      });
      for (const { id, p } of placed) {
        const el = carRefs.current.get(id);
        if (!el) continue;
        let x: number;
        let y: number;
        const point = geometry.pointAt(p.fraction);
        if (p.inPit) {
          // Ease sideways into the pit lane and back out onto the track.
          const k = p.fraction > 0.5 ? Math.min(1, (p.fraction - PIT_ENTRY) / 0.012) : Math.min(1, (PIT_EXIT - p.fraction) / 0.012);
          const tangent = geometry.tangentAt(p.fraction);
          const offset = PIT_OFFSET * Math.max(0, k);
          x = point.x - tangent.y * offset;
          y = point.y + tangent.x * offset;
        } else {
          x = point.x;
          y = point.y;
        }
        el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        if (el.dataset.phase !== p.phase) el.dataset.phase = p.phase;
      }
      const sc = scRef.current;
      if (sc) {
        const leader = order[0];
        const lap = leader ? Math.floor(leader.p.distance) + 1 : 0;
        const show = !!leader && leader.p.phase !== 'finished' && live.safetyCarLap(lap);
        sc.style.display = show ? '' : 'none';
        if (show) place(sc, leader.p.fraction + 0.025);
      }
    };
    return live.subscribe(draw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, geometry, reducedMotion]);

  useLayoutEffect(() => {
    if (live) return;
    const changed = lapKey !== lastLapKey.current;
    lastLapKey.current = lapKey;
    if (frame.current !== null) cancelAnimationFrame(frame.current);

    const targets = new Map(cars.map((c) => [c.id, c.fraction]));
    const scTarget = leaderFraction + 0.03;
    const prev = new Map(lastFractions.current);
    lastFractions.current = targets;

    if (!changed || reducedMotion || prev.size === 0) {
      cars.forEach((c) => place(carRefs.current.get(c.id), c.fraction));
      place(scRef.current, scTarget);
      return;
    }

    // Each car runs one full lap from its previous spot to its new one.
    const travel = new Map<string, { from: number; distance: number }>();
    for (const car of cars) {
      const from = prev.get(car.id) ?? car.fraction;
      let distance = car.fraction - from;
      distance = ((distance % 1) + 1) % 1;
      travel.set(car.id, { from, distance: distance + 1 });
      place(carRefs.current.get(car.id), from);
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ANIMATION_MS);
      const k = easeInOut(t);
      for (const car of cars) {
        const tr = travel.get(car.id)!;
        place(carRefs.current.get(car.id), tr.from + tr.distance * k);
      }
      place(scRef.current, scTarget - 1 + k);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else frame.current = null;
    };
    frame.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lapKey, cars, reducedMotion, geometry, leaderFraction, live]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const ordered = [...cars].sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer) || b.position - a.position);
  const showCars = variant === 'race' || variant === 'preview';
  const label = title ?? `${circuit.name} track map`;
  const sfAngle = (Math.atan2(startTangent.y, startTangent.x) * 180) / Math.PI;

  return (
    <svg
      className={`circuit-map circuit-map--${variant}${className ? ' ' + className : ''}`}
      viewBox="0 0 600 400"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{label}</title>
      {variant !== 'thumb' && <path className="circuit-map__pit" d={pitPath} />}
      <path className="circuit-map__edge" d={geometry.path} />
      <path className="circuit-map__surface" d={geometry.path} />
      <path className="circuit-map__line" d={geometry.path} pathLength={1000} />
      <g transform={`translate(${start.x} ${start.y}) rotate(${sfAngle})`} className="circuit-map__sf">
        <rect x={-2} y={-11} width={4} height={22} fill="var(--paper)" />
        <rect x={-2} y={-11} width={2} height={5.5} fill="var(--carbon-950)" />
        <rect x={0} y={-5.5} width={2} height={5.5} fill="var(--carbon-950)" />
        <rect x={-2} y={0} width={2} height={5.5} fill="var(--carbon-950)" />
        <rect x={0} y={5.5} width={2} height={5.5} fill="var(--carbon-950)" />
      </g>
      {variant !== 'thumb' && (
        <text className="circuit-map__pit-label" x={geometry.pointAt(0.06).x - startTangent.y * -26} y={geometry.pointAt(0.06).y + startTangent.x * -26}>
          Pit lane
        </text>
      )}
      {showCars && (safetyCar || live) && (
        <g ref={scRef} className="circuit-map__sc" aria-hidden="true" style={live ? { display: 'none' } : undefined}>
          <rect x={-13} y={-8} width={26} height={16} rx={2} />
          <text y={0.5} textAnchor="middle" dominantBaseline="central">
            SC
          </text>
        </g>
      )}
      {showCars &&
        ordered.map((car) => (
          <g
            key={car.id}
            ref={(el) => {
              if (el) carRefs.current.set(car.id, el);
              else carRefs.current.delete(car.id);
            }}
            className={`circuit-map__car${car.isPlayer ? ' is-player' : ''}`}
            aria-hidden="true"
          >
            {car.isPlayer && <circle r={13} className="circuit-map__halo" />}
            <circle r={car.isPlayer ? 9 : 8} fill={car.color} stroke="var(--carbon-950)" strokeWidth={2} />
            <text
              ref={(el) => {
                if (el) posRefs.current.set(car.id, el);
                else posRefs.current.delete(car.id);
              }}
              y={0.5}
              textAnchor="middle"
              dominantBaseline="central"
              className="circuit-map__pos"
            >
              {car.position}
            </text>
            {car.isPlayer && (
              <text x={16} y={-12} className="circuit-map__you">
                {car.code}
              </text>
            )}
          </g>
        ))}
    </svg>
  );
});
