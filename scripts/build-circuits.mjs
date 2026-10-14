#!/usr/bin/env node
/**
 * Converts real circuit layouts from the bacinger/f1-circuits GeoJSON dataset (MIT licence)
 * into compact outlines for the game: rotated to match the orientation of the official
 * Formula 1 circuit maps, fitted to a 600×400 view box, ordered in racing direction and
 * starting at the start/finish line.
 *
 * rotate: degrees (clockwise on screen) applied to a north-up projection; fitted against
 *         the official 2026 circuit maps on formula1.com.
 * shift:  start/finish position as a fraction of the lap from the dataset's first point,
 *         measured in the dataset's point order (read from the official maps).
 * reverse: true when the dataset's point order runs against the racing direction.
 *
 * Usage: node scripts/build-circuits.mjs <path-to-f1-circuits>/circuits > src/game/data/circuitOutlines.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/build-circuits.mjs <f1-circuits/circuits directory>');
  process.exit(1);
}

const CIRCUITS = [
  { id: 'albert-park', file: 'au-1953', rotate: 313, shift: -0.005 },
  { id: 'shanghai', file: 'cn-2004', rotate: 123.5, shift: -0.08 },
  { id: 'suzuka', file: 'jp-1962', rotate: -0.5, shift: -0.04 },
  { id: 'miami', file: 'us-2022', rotate: 346.5, shift: -0.03 },
  { id: 'montreal', file: 'ca-1978', rotate: 301, shift: 0.05 },
  { id: 'monaco', file: 'mc-1929', rotate: 46, shift: -0.277 },
  { id: 'barcelona', file: 'es-1991', rotate: 36.5, shift: -0.027 },
  { id: 'red-bull-ring', file: 'at-1969', rotate: 350.5, shift: -0.025 },
  { id: 'silverstone', file: 'gb-1948', rotate: 87.5, shift: 0.505 },
  { id: 'spa', file: 'be-1925', rotate: 262, shift: -0.017 },
  { id: 'hungaroring', file: 'hu-1986', rotate: 53.5, shift: -0.07 },
  { id: 'zandvoort', file: 'nl-1948', rotate: -0.5, shift: 0.008 },
  { id: 'monza', file: 'it-1922', rotate: 265, shift: -0.052 },
  { id: 'madring', file: 'es-2026', rotate: 90.5, shift: -0.048 },
  { id: 'baku', file: 'az-2016', rotate: 52.5, shift: -0.015 },
  { id: 'sepang', file: 'my-1999', rotate: 4.5, shift: -0.058 },
  { id: 'marina-bay', file: 'sg-2008', rotate: 2, shift: 0.02, reverse: true },
  { id: 'cota', file: 'us-2012', rotate: 3, shift: -0.055 },
  { id: 'mexico-city', file: 'mx-1962', rotate: 353, shift: -0.015 },
  { id: 'interlagos', file: 'br-1940', rotate: 89.5, shift: -0.003 },
  { id: 'las-vegas', file: 'us-2023', rotate: 270, shift: -0.04 },
  { id: 'lusail', file: 'qa-2004', rotate: 299, shift: -0.02 },
  { id: 'yas-marina', file: 'ae-2009', rotate: 100, shift: -0.026 },
  // Pre-season testing venue (not a 2026 Grand Prix).
  { id: 'sakhir', file: 'bh-2002', rotate: 268.5, shift: -0.032 },
];

const W = 600;
const H = 400;
const PAD = 30;
const SAMPLES = 200;

function resample(pts, n) {
  const closed = [...pts, pts[0]];
  const seg = [];
  let total = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const d = Math.hypot(closed[i + 1][0] - closed[i][0], closed[i + 1][1] - closed[i][1]);
    seg.push(d);
    total += d;
  }
  const out = [];
  let i = 0;
  let acc = 0;
  for (let s = 0; s < n; s++) {
    const target = (s / n) * total;
    while (acc + seg[i] < target && i < seg.length - 1) {
      acc += seg[i];
      i++;
    }
    const t = seg[i] === 0 ? 0 : (target - acc) / seg[i];
    out.push([closed[i][0] + (closed[i + 1][0] - closed[i][0]) * t, closed[i][1] + (closed[i + 1][1] - closed[i][1]) * t]);
  }
  return out;
}

const results = [];
for (const c of CIRCUITS) {
  const geo = JSON.parse(readFileSync(join(dir, `${c.file}.geojson`), 'utf8'));
  const feature = geo.features ? geo.features[0] : geo;
  const coords = feature.geometry.coordinates.slice();
  if (coords.length > 1 && coords[0][0] === coords.at(-1)[0] && coords[0][1] === coords.at(-1)[1]) coords.pop();

  // North-up equirectangular projection (screen y points down), then the official-map rotation.
  const lat0 = coords.reduce((s, p) => s + p[1], 0) / coords.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const rad = (c.rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let pts = coords.map(([lon, lat]) => {
    const x = lon * k;
    const y = -lat;
    return [x * cos - y * sin, x * sin + y * cos];
  });

  pts = resample(pts, SAMPLES);
  const start = ((Math.round(c.shift * SAMPLES) % SAMPLES) + SAMPLES) % SAMPLES;
  pts = [...pts.slice(start), ...pts.slice(0, start)];
  if (c.reverse) pts = [pts[0], ...pts.slice(1).reverse()];

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY));
  const offX = (W - (maxX - minX) * scale) / 2;
  const offY = (H - (maxY - minY) * scale) / 2;
  const fitted = pts.map(([x, y]) => [Math.round(((x - minX) * scale + offX) * 10) / 10, Math.round(((y - minY) * scale + offY) * 10) / 10]);
  results.push({ id: c.id, source: feature.properties?.Name ?? c.file, lengthM: feature.properties?.length ?? null, points: fitted });
}

const lines = [
  '/* eslint-disable */',
  '// Generated by scripts/build-circuits.mjs. Do not edit by hand.',
  '//',
  '// Circuit layouts derived from bacinger/f1-circuits (https://github.com/bacinger/f1-circuits),',
  '// Copyright (c) 2019-2025 Tomislav Bacinger, MIT licence. Rotated to match the orientation of',
  '// the official 2026 circuit maps, resampled and fitted to a 600×400 view box; index 0 is the',
  '// start/finish line and points follow the racing direction.',
  '',
  'export const CIRCUIT_OUTLINES: Record<string, Array<[number, number]>> = {',
];
for (const r of results) {
  lines.push(`  // ${r.source}${r.lengthM ? `, ${r.lengthM} m` : ''}`);
  lines.push(`  '${r.id}': [`);
  for (let i = 0; i < r.points.length; i += 8) {
    lines.push('    ' + r.points.slice(i, i + 8).map(([x, y]) => `[${x}, ${y}]`).join(', ') + ',');
  }
  lines.push('  ],');
}
lines.push('};', '');
process.stdout.write(lines.join('\n'));
