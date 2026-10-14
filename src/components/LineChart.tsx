import { memo, useMemo } from 'react';

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  /** Values by lap number (index = lap). Missing laps are null/undefined. */
  values: Array<number | null | undefined>;
  dashed?: boolean;
  emphasis?: boolean;
}

interface LineChartProps {
  series: ChartSeries[];
  maxLap: number;
  /** Fixed y range; computed from the data when omitted. */
  yMin?: number;
  yMax?: number;
  invert?: boolean;
  formatY: (value: number) => string;
  label: string;
  height?: number;
  /** Laps to shade (e.g. Safety Car laps). */
  shadedLaps?: number[];
  markers?: Array<{ lap: number; label: string }>;
}

const W = 320;
const PAD_L = 40;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 20;

/** Lightweight SVG line chart for lap-by-lap telemetry. */
export const LineChart = memo(function LineChart({
  series,
  maxLap,
  yMin,
  yMax,
  invert,
  formatY,
  label,
  height = 150,
  shadedLaps = [],
  markers = [],
}: LineChartProps) {
  const H = height;
  const { lo, hi } = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));
    let low = yMin ?? (all.length ? Math.min(...all) : 0);
    let high = yMax ?? (all.length ? Math.max(...all) : 1);
    if (high - low < 1e-6) {
      high += 1;
      low -= 1;
    }
    const pad = (high - low) * 0.08;
    return { lo: yMin ?? low - pad, hi: yMax ?? high + pad };
  }, [series, yMin, yMax]);

  const x = (lap: number) => PAD_L + ((lap - 1) / Math.max(1, maxLap - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => {
    const t = (v - lo) / (hi - lo);
    return invert ? PAD_T + t * (H - PAD_T - PAD_B) : H - PAD_B - t * (H - PAD_T - PAD_B);
  };
  const ticks = [0, 0.5, 1].map((t) => lo + (hi - lo) * t);
  const lapTicks = Array.from(new Set([1, Math.round(maxLap / 2), maxLap]));

  const paths = series.map((s) => {
    let d = '';
    let pen = false;
    s.values.forEach((v, lap) => {
      if (lap < 1 || typeof v !== 'number' || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(lap).toFixed(1)} ${y(Math.min(hi, Math.max(lo, v))).toFixed(1)}`;
      pen = true;
    });
    return { s, d };
  });

  const summary = series
    .map((s) => {
      const last = [...s.values].reverse().find((v) => typeof v === 'number');
      return `${s.label}: ${typeof last === 'number' ? formatY(last) : 'no data'}`;
    })
    .join('; ');

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. Latest values: ${summary}`}>
        {shadedLaps.map((lap) => (
          <rect
            key={lap}
            x={x(lap) - (W - PAD_L - PAD_R) / Math.max(1, maxLap - 1) / 2}
            y={PAD_T}
            width={(W - PAD_L - PAD_R) / Math.max(1, maxLap - 1)}
            height={H - PAD_T - PAD_B}
            className="chart__shade"
          />
        ))}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} className="chart__grid" />
            <text x={PAD_L - 6} y={y(t)} className="chart__tick" textAnchor="end" dominantBaseline="central">
              {formatY(t)}
            </text>
          </g>
        ))}
        {lapTicks.map((lap) => (
          <text key={lap} x={x(lap)} y={H - 5} className="chart__tick" textAnchor="middle">
            L{lap}
          </text>
        ))}
        {markers.map((m) => (
          <g key={`${m.lap}-${m.label}`}>
            <line x1={x(m.lap)} x2={x(m.lap)} y1={PAD_T} y2={H - PAD_B} className="chart__marker" />
            <text x={x(m.lap) + 3} y={PAD_T + 8} className="chart__marker-label">
              {m.label}
            </text>
          </g>
        ))}
        {paths.map(({ s, d }) => (
          <path
            key={s.id}
            d={d}
            fill="none"
            stroke={s.color}
            strokeWidth={s.emphasis ? 2.4 : 1.5}
            strokeDasharray={s.dashed ? '4 3' : undefined}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <figcaption className="chart__legend">
        {series.map((s) => (
          <span key={s.id} className="chart__key">
            <span className={`chart__swatch${s.dashed ? ' is-dashed' : ''}`} style={{ borderColor: s.color }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
});
