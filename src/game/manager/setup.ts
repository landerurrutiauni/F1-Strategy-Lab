/**
 * Car setup in practice. Every circuit has an ideal setup, shifted a little by each driver's
 * taste. The player tunes five settings; after running, the driver reports what the car is
 * doing. Feedback gets sharper with more running and a better simulator. The closer the
 * setup is to the ideal, the more pace the car has in qualifying and the races.
 */
import { createRng, deriveSeed } from '../rng';
import type { CircuitSpec } from '../types';
import { circuitWeights } from './carStats';

export type SetupParam = 'frontWing' | 'rearWing' | 'suspension' | 'rideHeight' | 'differential';
export type SetupValues = Record<SetupParam, number>;

export const SETUP_PARAMS: SetupParam[] = ['frontWing', 'rearWing', 'suspension', 'rideHeight', 'differential'];

export const SETUP_INFO: Record<SetupParam, { name: string; low: string; high: string; tooLow: string; tooHigh: string }> = {
  frontWing: { name: 'Front wing', low: 'Less angle', high: 'More angle', tooLow: 'Understeer: the front will not turn in', tooHigh: 'Oversteer on entry: the rear steps out' },
  rearWing: { name: 'Rear wing', low: 'Low drag', high: 'High downforce', tooLow: 'Rear is nervous in fast corners', tooHigh: 'Too slow on the straights' },
  suspension: { name: 'Suspension', low: 'Soft', high: 'Stiff', tooLow: 'Lazy in direction changes', tooHigh: 'Bouncing over kerbs and bumps' },
  rideHeight: { name: 'Ride height', low: 'Low', high: 'High', tooLow: 'Bottoming out and sparking', tooHigh: 'Losing downforce under the floor' },
  differential: { name: 'Differential', low: 'Open', high: 'Locked', tooLow: 'Wheelspin out of slow corners', tooHigh: 'Understeer in mid-corner' },
};

export const NEUTRAL_SETUP: SetupValues = { frontWing: 50, rearWing: 50, suspension: 50, rideHeight: 50, differential: 50 };

export interface SetupFeedback {
  /** Signed reading per setting (−1 much too low … +1 much too high), with the driver's uncertainty. */
  readings: Record<SetupParam, number>;
  /** Setup quality the engineers estimate from the run (0–1). */
  confidence: number;
}

export interface DriverSetup {
  values: SetupValues;
  /** The setup the latest feedback refers to (the one the driver last ran). */
  tested: SetupValues | null;
  feedback: SetupFeedback | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ideal setup for a driver at a circuit: from the circuit's character, plus the driver's taste. */
export function idealSetup(circuit: CircuitSpec, driverId: string, seed: number): SetupValues {
  const w = circuitWeights(circuit);
  const rng = createRng(deriveSeed(seed, circuit.round * 97 + hashText(driverId)));
  const downforce = 1 - w.straightLine; // straights want less wing
  const bumpy = circuit.sector === 'street' ? 0.75 : circuit.sector === 'speed' ? 0.45 : 0.35;
  const traction = w.lowSpeed;
  const taste = () => rng.range(-8, 8);
  return {
    frontWing: Math.round(clamp(25 + 55 * downforce + taste(), 5, 95)),
    rearWing: Math.round(clamp(20 + 60 * downforce + taste(), 5, 95)),
    suspension: Math.round(clamp(80 - 55 * bumpy + taste(), 5, 95)),
    rideHeight: Math.round(clamp(25 + 50 * bumpy + taste(), 5, 95)),
    differential: Math.round(clamp(70 - 50 * traction + taste(), 5, 95)),
  };
}

/** How close a setup is to the ideal (1 = perfect). */
export function setupQuality(values: SetupValues, ideal: SetupValues): number {
  const miss = SETUP_PARAMS.reduce((sum, p) => sum + Math.abs(values[p] - ideal[p]), 0) / SETUP_PARAMS.length;
  return clamp(1 - miss / 40, 0, 1);
}

/** Pace gained from the setup (s/lap; negative is faster). A poor setup costs up to 0.35 s. */
export function setupPace(quality: number): number {
  return Math.round((0.35 - 0.6 * quality ** 1.3) * 1000) / 1000;
}

/**
 * The driver's report after running: each setting read as too low or too high, with noise
 * that shrinks as knowledge grows (running, the simulator).
 */
export function readSetup(values: SetupValues, ideal: SetupValues, knowledge: number, seed: number): SetupFeedback {
  const rng = createRng(seed);
  const noise = 16 * (1 - knowledge) + 3;
  const readings = {} as Record<SetupParam, number>;
  for (const p of SETUP_PARAMS) readings[p] = clamp((values[p] - ideal[p] + rng.normal(0, noise)) / 30, -1, 1);
  const quality = setupQuality(values, ideal);
  return { readings, confidence: clamp(quality + rng.normal(0, 0.08 * (1 - knowledge)), 0, 1) };
}

/**
 * Starting setup for a weekend: the simulator team's prediction of the ideal, which is closer
 * with a better simulator.
 */
export function baselineSetup(ideal: SetupValues, simulatorLevel: number, seed: number): SetupValues {
  const rng = createRng(seed);
  const spread = 19 - 2.6 * simulatorLevel;
  const out = { ...ideal };
  for (const p of SETUP_PARAMS) out[p] = Math.round(clamp(ideal[p] + rng.normal(0, spread), 0, 100));
  return out;
}

/** What the engineers would change: a step towards the driver's reading on every setting. */
export function suggestedSetup(values: SetupValues, feedback: SetupFeedback): SetupValues {
  const next = { ...values };
  for (const p of SETUP_PARAMS) next[p] = Math.round(clamp(values[p] - feedback.readings[p] * 22, 0, 100));
  return next;
}

export function feedbackText(param: SetupParam, reading: number): string {
  if (Math.abs(reading) < 0.12) return 'Feels right';
  const info = SETUP_INFO[param];
  const strength = Math.abs(reading) > 0.55 ? 'Much: ' : '';
  return `${strength}${reading < 0 ? info.tooLow : info.tooHigh}`;
}

function hashText(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 10007;
  return h;
}
