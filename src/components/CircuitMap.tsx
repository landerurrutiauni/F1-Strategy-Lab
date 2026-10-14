import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { circuitGeometry } from '../game/trackGeometry';
import type { CircuitSpec } from '../game/types';

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

  useLayoutEffect(() => {
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
  }, [lapKey, cars, reducedMotion, geometry, leaderFraction]);

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
      {showCars && safetyCar && (
        <g ref={scRef} className="circuit-map__sc" aria-hidden="true">
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
            <text y={0.5} textAnchor="middle" dominantBaseline="central" className="circuit-map__pos">
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
