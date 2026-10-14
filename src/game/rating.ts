import { COMPOUNDS } from './data/tyres';
import { getPlayerCar } from './engine';
import type { RaceState } from './types';

/**
 * Strategy rating.
 *
 * Scores the decisions the player controlled, not the finishing position:
 *  - Pit calls (40%): estimated seconds lost versus the best plan available at the
 *    time of each decision (using the same projection the player saw).
 *  - Tyre management (25%): running tyres past 85% wear, failures, pushing on worn tyres.
 *  - Weather calls (20%): seconds lost per lap on a tyre that did not suit the track.
 *    Skipped when the weather never made tyre choice matter.
 *  - Execution (15%): mistakes (worse when pushing), crashes and rule penalties.
 *
 * Luck (Safety Car timing, pit crew errors, rival retirements) is reported separately
 * and does not change the score.
 */

export interface RatingFactor {
  id: 'pit' | 'tyres' | 'weather' | 'execution';
  label: string;
  score: number;
  weight: number;
  summary: string;
}

export interface KeyDecision {
  lap: number;
  effect: 'helped' | 'harmed';
  title: string;
  detail: string;
  seconds: number;
}

export interface LuckNote {
  lap: number;
  effect: 'good' | 'bad';
  text: string;
}

export interface StrategyRating {
  score: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  headline: string;
  factors: RatingFactor[];
  keyDecisions: KeyDecision[];
  luck: LuckNote[];
  /** Total estimated regret from pit decisions (s). */
  pitRegret: number;
}

const clampScore = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

export function gradeFor(score: number): StrategyRating['grade'] {
  if (score >= 92) return 'S';
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

export function rateStrategy(state: RaceState): StrategyRating {
  const player = getPlayerCar(state);
  const log = state.decisionLog;

  // Pit calls.
  const pitRegret = log.reduce((sum, d) => sum + d.regret, 0);
  const pitScore = clampScore(100 * Math.exp(-pitRegret / 18));
  const pitSummary =
    pitRegret < 1.5
      ? 'Your stops matched the best plan available at each decision.'
      : `Your pit calls cost about ${pitRegret.toFixed(1)} s against the best plan available at the time (estimate).`;

  // Tyre management.
  let tyreScore = 100;
  const overWorn = log.filter((d) => d.wearAtStart > 85).length;
  const pushingWorn = log.filter((d) => d.decision.pace === 'push' && d.wearAtStart > 75 && !d.safetyCar).length;
  tyreScore -= overWorn * 10 + player.tyreFailures * 25 + pushingWorn * 4;
  const tyreNotes: string[] = [];
  if (player.tyreFailures > 0) tyreNotes.push(`${player.tyreFailures} tyre failure${player.tyreFailures > 1 ? 's' : ''}`);
  if (overWorn > 0) tyreNotes.push(`${overWorn} lap${overWorn > 1 ? 's' : ''} started above 85% wear`);
  if (pushingWorn > 0) tyreNotes.push(`pushed on worn tyres for ${pushingWorn} lap${pushingWorn > 1 ? 's' : ''}`);
  const tyreSummary = tyreNotes.length ? `Watch out: ${tyreNotes.join(', ')}.` : 'Tyres were kept in a healthy window all race.';

  // Weather calls.
  const mismatchLoss = log.reduce((sum, d) => sum + Math.max(0, d.tyreMismatch - 0.5), 0);
  const weatherRelevant = state.wetnessHistory.some((w) => w >= 0.08) || mismatchLoss > 0;
  const weatherScore = clampScore(100 * Math.exp(-mismatchLoss / 12));
  const weatherSummary =
    mismatchLoss < 1
      ? 'You were on the right type of tyre for the conditions.'
      : `About ${mismatchLoss.toFixed(1)} s lost running tyres that did not suit the track.`;

  // Execution.
  const playerIncidents = state.events.filter((e) => e.carId === player.id && e.kind === 'incident');
  let execScore = 100;
  for (const incident of playerIncidents) {
    const decision = log.find((d) => d.lap === incident.lap);
    execScore -= decision?.decision.pace === 'push' ? 10 : 5;
  }
  if (player.status === 'retired') execScore -= 55;
  const penalty = state.classification?.find((e) => e.carId === player.id)?.penaltyTime ?? 0;
  if (penalty > 0) execScore -= 50;
  const execSummary =
    player.status === 'retired'
      ? 'The car did not finish.'
      : penalty > 0
        ? 'A compound-rule penalty undid good work.'
        : playerIncidents.length > 0
          ? `${playerIncidents.length} driver mistake${playerIncidents.length > 1 ? 's' : ''} cost time.`
          : 'A clean race with no mistakes or penalties.';

  const factors: RatingFactor[] = [
    { id: 'pit', label: 'Pit calls', score: pitScore, weight: 0.4, summary: pitSummary },
    { id: 'tyres', label: 'Tyre management', score: clampScore(tyreScore), weight: 0.25, summary: tyreSummary },
  ];
  if (weatherRelevant) factors.push({ id: 'weather', label: 'Weather calls', score: weatherScore, weight: 0.2, summary: weatherSummary });
  factors.push({ id: 'execution', label: 'Execution', score: clampScore(execScore), weight: 0.15, summary: execSummary });

  const weightTotal = factors.reduce((s, f) => s + f.weight, 0);
  const score = clampScore(factors.reduce((s, f) => s + f.score * f.weight, 0) / weightTotal);

  // Key decisions: biggest estimated gains and losses.
  const keyDecisions: KeyDecision[] = [];
  for (const d of log) {
    if (d.decision.box && d.gainVsAlternative >= 2) {
      keyDecisions.push({
        lap: d.lap,
        effect: 'helped',
        title: `Lap ${d.lap}: boxed for ${COMPOUNDS[d.decision.compound].name}${d.safetyCar ? ' under the Safety Car' : ''}`,
        detail: `Estimated ${d.gainVsAlternative.toFixed(1)} s better than staying out.`,
        seconds: d.gainVsAlternative,
      });
    }
  }
  // Group consecutive costly laps so one late stop is reported once.
  let run: typeof log = [];
  const flush = () => {
    if (run.length === 0) return;
    const worst = run.reduce((a, b) => (b.regret > a.regret ? b : a));
    const total = run.reduce((s, d) => s + d.regret, 0);
    const action = worst.decision.box ? `boxed for ${COMPOUNDS[worst.decision.compound].name}` : 'stayed out';
    keyDecisions.push({
      lap: worst.lap,
      effect: 'harmed',
      title: run.length > 1 ? `Laps ${run[0].lap}–${run[run.length - 1].lap}: ${action}` : `Lap ${worst.lap}: ${action}`,
      detail: `Estimated ${total.toFixed(1)} s lost. The best plan at the time was "${worst.bestPlanLabel}".`,
      seconds: total,
    });
    run = [];
  };
  for (const d of log) {
    if (d.regret >= 1) {
      if (run.length && run[run.length - 1].lap !== d.lap - 1) flush();
      run.push(d);
    } else flush();
  }
  flush();
  const weatherLaps = log.filter((d) => d.tyreMismatch > 1.5);
  if (weatherLaps.length > 0) {
    const lost = weatherLaps.reduce((s, d) => s + d.tyreMismatch, 0);
    keyDecisions.push({
      lap: weatherLaps[0].lap,
      effect: 'harmed',
      title: `${weatherLaps.length} lap${weatherLaps.length > 1 ? 's' : ''} on the wrong tyre for the conditions`,
      detail: `About ${lost.toFixed(1)} s slower than the best tyre for the track at the time.`,
      seconds: lost,
    });
  }
  keyDecisions.sort((a, b) => b.seconds - a.seconds);

  // Luck: things outside the strategist's control.
  const luck: LuckNote[] = [];
  for (const stop of player.pitStops) {
    if (stop.note?.includes('+')) luck.push({ lap: stop.lap, effect: 'bad', text: `Slow stop on lap ${stop.lap}: ${stop.note}. A crew issue, not a strategy call.` });
    else if (stop.note) luck.push({ lap: stop.lap, effect: 'good', text: `Lap ${stop.lap}: the crew delivered a rapid ${stop.stationaryTime.toFixed(1)} s stop.` });
  }
  const scEvents = state.events.filter((e) => e.kind === 'safety-car' && e.title === 'Safety Car deployed');
  for (const sc of scEvents) {
    const recentStop = player.pitStops.find((p) => !p.underSafetyCar && sc.lap - p.lap >= 0 && sc.lap - p.lap <= 2);
    if (recentStop) {
      luck.push({
        lap: sc.lap,
        effect: 'bad',
        text: `The Safety Car came out ${sc.lap - recentStop.lap === 0 ? 'on the lap you pitted' : `${sc.lap - recentStop.lap} lap${sc.lap - recentStop.lap > 1 ? 's' : ''} after your stop`}, giving rivals a cheaper stop. Bad timing, not a bad call.`,
      });
    }
  }
  const retiredAhead = state.cars.filter(
    (c) => !c.isPlayer && c.status === 'retired' && c.retiredLap !== null && (player.laps.find((l) => l.lap === (c.retiredLap ?? 0) - 1)?.position ?? 99) > (c.laps.find((l) => l.lap === (c.retiredLap ?? 0) - 1)?.position ?? 0),
  );
  if (retiredAhead.length > 0) {
    luck.push({
      lap: retiredAhead[0].retiredLap ?? 0,
      effect: 'good',
      text: `${retiredAhead.length} rival${retiredAhead.length > 1 ? 's' : ''} running ahead of you retired.`,
    });
  }

  const sortedFactors = [...factors].sort((a, b) => a.score - b.score);
  const weakest = sortedFactors[0];
  const strongest = sortedFactors[sortedFactors.length - 1];
  const headline =
    score >= 92
      ? 'Textbook strategy: every major call was right.'
      : score >= 80
        ? `Strong strategy. Best area: ${strongest.label.toLowerCase()}.`
        : score >= 65
          ? `Solid, with room to improve ${weakest.label.toLowerCase()}.`
          : `${weakest.label} cost you the most this time.`;

  return { score, grade: gradeFor(score), headline, factors, keyDecisions: keyDecisions.slice(0, 5), luck, pitRegret };
}
