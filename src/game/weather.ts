import { DRYING_RATE, FORECAST_HORIZON, WETTING_RATE } from './constants';
import { createRng, deriveSeed, type Rng } from './rng';
import type { CircuitSpec, ForecastEntry, RaceState, ScenarioId, WeatherScenario } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Builds the hidden "true" rain intensity for every lap. Index n holds lap n
 * (index 0 mirrors lap 1 so the pre-race state has a defined value).
 */
export function generateWeatherTimeline(
  rng: Rng,
  laps: number,
  scenario: WeatherScenario,
  circuit: CircuitSpec,
  scenarioId: ScenarioId = 'none',
): number[] {
  const timeline = new Array<number>(laps + 1).fill(0);

  if (scenarioId === 'storm') {
    const start = Math.max(3, Math.round(laps * 0.3));
    for (let lap = start; lap <= laps; lap++) timeline[lap] = lap === start ? 0.45 : 0.85;
  } else if (scenarioId === 'drying') {
    const dryBy = Math.max(4, Math.round(laps * 0.4));
    for (let lap = 1; lap <= laps; lap++) timeline[lap] = lap >= dryBy ? 0 : round2(0.6 * (1 - (lap - 1) / (dryBy - 1)));
  } else if (scenario === 'variable') {
    const showerChance = clamp(0.5 + (circuit.rainPropensity - 0.5) * 0.4, 0.35, 0.7);
    if (rng.chance(showerChance)) {
      // A passing shower in the middle of the race.
      const start = Math.max(2, Math.round(laps * rng.range(0.3, 0.55)));
      const length = Math.max(2, Math.round(laps * rng.range(0.2, 0.35)));
      const peak = clamp(rng.range(0.42, 0.78) + (circuit.rainPropensity - 0.5) * 0.15, 0.35, 0.9);
      for (let i = 0; i < length; i++) {
        const lap = start + i;
        if (lap > laps) break;
        const shape = i === 0 ? 0.6 : i === length - 1 ? 0.5 : 1;
        timeline[lap] = round2(peak * shape);
      }
    } else {
      // A wet start on a drying track.
      const initial = rng.range(0.45, 0.7);
      const dryBy = Math.max(3, Math.round(laps * rng.range(0.3, 0.5)));
      for (let lap = 1; lap <= laps; lap++) {
        timeline[lap] = lap >= dryBy ? 0 : round2(initial * (1 - (lap - 1) / (dryBy - 1)));
      }
    }
  } else if (scenario === 'rainy') {
    const base = rng.range(0.58, 0.85);
    const eases = rng.chance(0.5);
    const easeFrom = Math.round(laps * rng.range(0.55, 0.7));
    let drift = 0;
    for (let lap = 1; lap <= laps; lap++) {
      drift = drift * 0.6 + rng.normal(0, 0.07);
      let value = base + drift;
      if (eases && lap >= easeFrom) {
        const progress = (lap - easeFrom + 1) / (laps - easeFrom + 1);
        value = value * (1 - progress) + 0.22 * progress;
      }
      timeline[lap] = round2(clamp(value, 0.2, 1));
    }
  }

  timeline[0] = timeline[1];
  return timeline;
}

/** Wetness for the next lap given the current wetness and the rain intensity of that lap. */
export function nextWetness(current: number, rain: number): number {
  const rate = rain > current ? WETTING_RATE : DRYING_RATE;
  const value = current + rate * (rain - current);
  return round2(clamp(value < 0.02 ? 0 : value, 0, 1));
}

/** Initial track wetness: if it is raining at the start, the track is already wet. */
export function initialWetness(timeline: number[]): number {
  return round2(clamp(timeline[1] ?? 0, 0, 1));
}

/**
 * Radar forecast for the laps after the upcoming one. Accuracy falls with distance:
 * the estimate gains noise and, beyond two laps, may be off by a lap in timing.
 * Noise comes from a seed derived from (race seed, issue lap) so it never depends on rendering.
 */
export function buildForecast(
  timeline: number[],
  seed: number,
  issuedAfterLap: number,
  totalLaps: number,
  scenario: WeatherScenario,
): ForecastEntry[] {
  const rng = createRng(deriveSeed(seed, 1000 + issuedAfterLap));
  const entries: ForecastEntry[] = [];
  const firstLap = issuedAfterLap + 2;
  for (let d = 1; d <= FORECAST_HORIZON; d++) {
    const lap = firstLap + d - 1;
    // Always consume the same number of draws so forecasts stay stable.
    const shiftRoll = rng.next();
    const noise = rng.normal(0, 0.035 * d);
    if (lap > totalLaps) continue;
    let shift = 0;
    if (d >= 3) shift = shiftRoll < 0.25 ? -1 : shiftRoll > 0.75 ? 1 : 0;
    const sourceLap = clamp(lap + shift, 1, totalLaps);
    const truth = timeline[sourceLap] ?? 0;
    let estimate: number;
    if (scenario === 'dry') estimate = 0;
    else if (truth < 0.03) estimate = noise > 0.12 ? noise - 0.12 : 0; // occasional false alarm, small
    else estimate = clamp(truth + noise, 0.03, 1);
    entries.push({ lap, rain: round2(estimate), confidence: round2(clamp(1 - 0.14 * d, 0.2, 1)) });
  }
  return entries;
}

/**
 * Long-range outlook beyond the radar horizon, as a percentage chance of rain.
 * Deterministic for a given race and lap.
 */
export function longRangeRainChance(state: Pick<RaceState, 'weatherTimeline' | 'config' | 'lap' | 'totalLaps'>): number | null {
  const beyond = state.lap + 2 + FORECAST_HORIZON;
  if (beyond > state.totalLaps) return null;
  const rng = createRng(deriveSeed(state.config.seed, 5000 + state.lap));
  const later = state.weatherTimeline.slice(beyond, state.totalLaps + 1);
  const wetLater = later.some((r) => r >= 0.2);
  if (state.config.weather === 'dry' && !wetLater) return 0;
  const base = wetLater ? rng.range(0.55, 0.8) : state.config.weather === 'rainy' ? rng.range(0.4, 0.6) : rng.range(0.1, 0.3);
  return Math.round(base * 20) * 5;
}

/** Typical rain intensity for a scenario, used beyond the radar horizon. */
export function climatologyRain(scenario: WeatherScenario): number {
  return scenario === 'dry' ? 0 : scenario === 'variable' ? 0.08 : 0.55;
}

export function rainLabel(rain: number): string {
  if (rain < 0.05) return 'No rain';
  if (rain < 0.25) return 'Drizzle';
  if (rain < 0.5) return 'Light rain';
  if (rain < 0.8) return 'Heavy rain';
  return 'Torrential rain';
}

export function wetnessLabel(wetness: number): string {
  if (wetness < 0.08) return 'Dry';
  if (wetness < 0.22) return 'Damp';
  if (wetness < 0.6) return 'Wet';
  return 'Soaked';
}

export type WeatherIconKind = 'sun' | 'cloud' | 'drizzle' | 'rain' | 'storm';

export function weatherIconKind(rain: number, wetness: number): WeatherIconKind {
  if (rain >= 0.8) return 'storm';
  if (rain >= 0.25) return 'rain';
  if (rain >= 0.05) return 'drizzle';
  if (wetness >= 0.08) return 'cloud';
  return 'sun';
}

export function describeScenarioForecast(scenario: WeatherScenario, circuit: CircuitSpec): string {
  if (scenario === 'dry') return `Dry all race. Track around ${circuit.trackTemp}°C.`;
  if (scenario === 'rainy') return 'Rain from the start. Intensity varies and may ease late on.';
  const pct = Math.round(clamp(0.5 + (circuit.rainPropensity - 0.5) * 0.4, 0.35, 0.7) * 100);
  return `Changeable: about ${pct}% chance of a mid-race shower, otherwise a wet start on a drying track.`;
}
