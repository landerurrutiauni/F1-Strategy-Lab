import { Route } from 'lucide-react';
import { formatDelta, formatRaceTime } from '../../game/format';
import { highlightPlans, type StrategyOutlook } from '../../game/projection';
import type { CarState, RaceState } from '../../game/types';
import { Panel } from '../Panel';
import { TyreBadge } from '../TyreBadge';

interface StrategyPanelProps {
  race: RaceState;
  car: CarState;
  outlook: StrategyOutlook | null;
  showProjections: boolean;
}

export function StrategyPanel({ race, car, outlook, showProjections }: StrategyPanelProps) {
  // Compare green-flag laps only: Safety Car laps slow everyone and were not in the plan.
  let vsPlan: number | null = null;
  if (race.lap > 0 && car.status === 'running' && race.preRacePlanElapsed.length > 0) {
    const firstLap = car.laps[0];
    const startElapsed = firstLap ? firstLap.elapsed - firstLap.lapTime : 0;
    vsPlan = 0;
    for (const lap of car.laps) {
      const planEnd = race.preRacePlanElapsed[lap.lap];
      const planStart = lap.lap === 1 ? startElapsed : race.preRacePlanElapsed[lap.lap - 1];
      if (lap.safetyCar || typeof planEnd !== 'number' || typeof planStart !== 'number') continue;
      vsPlan += lap.lapTime - (planEnd - planStart);
    }
  }
  const plans = outlook ? highlightPlans(outlook, 3) : [];

  return (
    <Panel title="Strategy outlook" icon={<Route size={16} />} className="strategy">
      <dl className="readouts">
        <div>
          <dt>Race time</dt>
          <dd className="num">{formatRaceTime(car.elapsed)}</dd>
        </div>
        <div>
          <dt>Projected finish</dt>
          <dd className="num">{showProjections && outlook ? formatRaceTime(outlook.best.totalTime) : '–'}</dd>
        </div>
        <div>
          <dt title="Green-flag laps compared with the best pre-race plan">Vs pre-race plan</dt>
          <dd className={`num${vsPlan !== null ? (vsPlan <= 0 ? ' is-good' : ' is-bad') : ''}`}>{vsPlan !== null ? formatDelta(vsPlan) : '–'}</dd>
        </div>
      </dl>

      {!showProjections ? (
        <p className="muted">Projections are hidden. Turn them on in Settings.</p>
      ) : !outlook ? (
        <p className="muted">No decisions left to project.</p>
      ) : (
        <>
          <ol className="plans" aria-label="Best plans found (estimates)">
            {plans.map((plan, i) => (
              <li key={i} className={`plan${i === 0 ? ' is-best' : ''}`}>
                <span className="plan__rank">{i === 0 ? 'Best est.' : `Option ${String.fromCharCode(65 + i)}`}</span>
                <span className="plan__stops">
                  {plan.stops.length === 0 ? (
                    <span>Run to the flag</span>
                  ) : (
                    plan.stops.map((s) => (
                      <span key={s.lap} className="plan__stop">
                        <span className="muted">L{s.lap}</span> <TyreBadge compound={s.compound} size={16} />
                      </span>
                    ))
                  )}
                  {plan.penalty > 0 && <span className="tag tag--danger">+{plan.penalty} s rule</span>}
                </span>
                <span className="plan__delta num">{i === 0 ? formatRaceTime(plan.totalTime) : formatDelta(plan.delta)}</span>
              </li>
            ))}
          </ol>
          <details className="assumptions">
            <summary>How these estimates work</summary>
            <ul>
              <li>Remaining laps are projected with the same lap-time and tyre-wear formulas as the race, at standard pace.</li>
              <li>Track wetness follows the radar for the next five laps, then drifts toward this race's typical conditions.</li>
              <li>{race.safetyCar.active ? `The Safety Car is assumed to stay out for ${race.safetyCar.lapsRemaining} more lap${race.safetyCar.lapsRemaining > 1 ? 's' : ''}.` : 'No future Safety Cars are assumed.'}</li>
              <li>Traffic, rival stops, mistakes and slow stops are not included, and a tyre-failure risk cost is added above 85% wear.</li>
              <li>Using two dry compounds is required in a fully dry race; plans that break the rule include the time penalty.</li>
            </ul>
          </details>
        </>
      )}
    </Panel>
  );
}
