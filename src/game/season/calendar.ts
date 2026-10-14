import type { Rng } from '../rng';
import type { CircuitSpec, WeatherScenario } from '../types';
import type { QualiSessionId, SessionId, SessionWeather } from './types';

export interface SessionInfo {
  name: string;
  short: string;
  day: 'Friday' | 'Saturday' | 'Sunday';
}

/** Session names and days. On Sprint weekends qualifying moves to Saturday after the Sprint. */
export const SESSION_INFO: Record<SessionId, SessionInfo> = {
  fp1: { name: 'Practice 1', short: 'FP1', day: 'Friday' },
  fp2: { name: 'Practice 2', short: 'FP2', day: 'Friday' },
  fp3: { name: 'Practice 3', short: 'FP3', day: 'Saturday' },
  'sprint-quali': { name: 'Sprint Qualifying', short: 'SQ', day: 'Friday' },
  sprint: { name: 'Sprint', short: 'Sprint', day: 'Saturday' },
  quali: { name: 'Qualifying', short: 'Quali', day: 'Saturday' },
  race: { name: 'Grand Prix', short: 'Race', day: 'Sunday' },
};

/**
 * Standard weekend: three practice sessions, qualifying, Grand Prix.
 * Sprint weekend: one practice session, Sprint Qualifying, Sprint, qualifying, Grand Prix.
 */
export function weekendSessions(circuit: Pick<CircuitSpec, 'sprint'>): SessionId[] {
  return circuit.sprint ? ['fp1', 'sprint-quali', 'sprint', 'quali', 'race'] : ['fp1', 'fp2', 'fp3', 'quali', 'race'];
}

/** Q1–Q3, or SQ1–SQ3 in Sprint Qualifying. */
export function segmentName(session: QualiSessionId, index: number): string {
  return `${session === 'sprint-quali' ? 'SQ' : 'Q'}${index}`;
}

export const WEATHER_LABEL: Record<WeatherScenario, string> = {
  dry: 'Dry',
  variable: 'Showers possible',
  rainy: 'Wet',
};

/**
 * Weekend forecast. A weather system (wet, unsettled or settled) is drawn from the venue's
 * rain propensity; each session then varies around it.
 */
export function generateWeekendWeather(rng: Rng, circuit: CircuitSpec, sessions: SessionId[]): Record<SessionId, SessionWeather | undefined> {
  const p = circuit.rainPropensity;
  const roll = rng.next();
  const system: 'wet' | 'unsettled' | 'settled' = roll < p * 0.3 ? 'wet' : roll < p * 1.1 ? 'unsettled' : 'settled';
  const out: Record<SessionId, SessionWeather | undefined> = {
    fp1: undefined,
    fp2: undefined,
    fp3: undefined,
    'sprint-quali': undefined,
    sprint: undefined,
    quali: undefined,
    race: undefined,
  };
  for (const id of sessions) {
    const r = rng.next();
    let scenario: WeatherScenario;
    if (system === 'wet') scenario = r < 0.55 ? 'rainy' : r < 0.85 ? 'variable' : 'dry';
    else if (system === 'unsettled') scenario = r < 0.12 ? 'rainy' : r < 0.55 ? 'variable' : 'dry';
    else scenario = r < 0.08 ? 'variable' : 'dry';
    const wetness = scenario === 'dry' ? 0 : scenario === 'rainy' ? rng.range(0.55, 0.9) : rng.chance(0.5) ? rng.range(0.05, 0.4) : 0;
    out[id] = { scenario, wetness: Math.round(wetness * 100) / 100 };
  }
  return out;
}
