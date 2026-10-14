import { CircleAlert, Wrench, Zap } from 'lucide-react';
import { BOOST_COST, PACE_MODES } from '../../game/constants';
import { COMPOUNDS, COMPOUND_ORDER } from '../../game/data/tyres';
import { getDriver } from '../../game/data/teams';
import { getPlayerCar } from '../../game/engine';
import { formatDelta } from '../../game/format';
import type { RejoinEstimate, StrategyOutlook } from '../../game/projection';
import type { PaceMode, PlayerDecision, RaceState } from '../../game/types';
import { Segmented } from '../Segmented';
import { TyreBadge } from '../TyreBadge';

interface DecisionPanelProps {
  race: RaceState;
  decision: PlayerDecision;
  decisionError: string | null;
  outlook: StrategyOutlook | null;
  rejoin: RejoinEstimate | null;
  showProjections: boolean;
  onChange: (patch: Partial<PlayerDecision>) => void;
  onAdvance: () => void;
  onFinishAfterRetirement: () => void;
}

const PACE_ORDER: PaceMode[] = ['conserve', 'standard', 'push'];

export function DecisionPanel({
  race,
  decision,
  decisionError,
  outlook,
  rejoin,
  showProjections,
  onChange,
  onAdvance,
  onFinishAfterRetirement,
}: DecisionPanelProps) {
  const player = getPlayerCar(race);
  const upcoming = race.lap + 1;
  const finalLap = upcoming >= race.totalLaps;
  const sc = race.safetyCar.active;

  if (player.status !== 'running') {
    return (
      <section className="deck deck--retired" aria-labelledby="deck-title">
        <h2 id="deck-title" className="deck__title">
          {getDriver(player.driverId).name} is out of the race
        </h2>
        <p className="deck__explain">{player.retiredReason}. Simulate the remaining laps to see the final classification.</p>
        <button type="button" className="btn btn--primary btn--xl" onClick={onFinishAfterRetirement}>
          <span className="btn__label">Simulate to the flag</span>
        </button>
      </section>
    );
  }

  const boxDelta = (compound: (typeof COMPOUND_ORDER)[number]) => {
    const plan = outlook?.boxNowByCompound[compound];
    return plan && outlook ? plan.totalTime - outlook.best.totalTime : null;
  };
  const pitNow = outlook?.pitNowDelta ?? null;

  return (
    <section className="deck" aria-labelledby="deck-title">
      <header className="deck__head">
        <h2 id="deck-title" className="deck__title">
          {finalLap ? 'Final lap call' : `Lap ${upcoming} call`}
        </h2>
        <p className="deck__explain">
          {finalLap
            ? 'Set the pace for the last lap. No pit stops on the final lap.'
            : `Choices apply to lap ${upcoming}. Boxing brings ${getDriver(player.driverId).code} in at the end of lap ${upcoming}, on new tyres from lap ${upcoming + 1}.`}
        </p>
      </header>

      <div className="deck__grid">
        <div className="deck__block">
          <Segmented<PaceMode>
            legend="Race pace"
            value={decision.pace}
            onChange={(pace) => onChange({ pace })}
            options={PACE_ORDER.map((id) => {
              const spec = PACE_MODES[id];
              return {
                value: id,
                label: spec.label,
                disabled: sc && id !== 'standard',
                hint:
                  id === 'standard' ? (
                    <>Balanced</>
                  ) : (
                    <>
                      {formatDelta(spec.lapDelta, 2)}/lap
                      <br />
                      {spec.wearMultiplier < 1 ? `${Math.round((1 - spec.wearMultiplier) * 100)}% less wear` : `${Math.round((spec.wearMultiplier - 1) * 100)}% more wear`}
                    </>
                  ),
              };
            })}
          />
          {sc && <p className="deck__note">Behind the Safety Car everyone runs at controlled pace.</p>}

          <label className={`switch${decision.boost ? ' is-on' : ''}${sc || player.battery < BOOST_COST ? ' is-disabled' : ''}`}>
            <input
              type="checkbox"
              role="switch"
              checked={decision.boost}
              disabled={sc || player.battery < BOOST_COST}
              onChange={(e) => onChange({ boost: e.target.checked })}
            />
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
            <span className="switch__text">
              <span className="switch__label">
                <Zap size={14} aria-hidden="true" /> Overtake boost
              </span>
              <span className="switch__hint">
                −0.3 s and easier passing. Uses {BOOST_COST}% energy.
              </span>
            </span>
            <span className="energy" aria-label={`Energy store ${Math.round(player.battery)}%`}>
              <span className="energy__bar">
                <span className="energy__fill" style={{ width: `${player.battery}%` }} />
              </span>
              <span className="energy__value">{Math.round(player.battery)}%</span>
            </span>
          </label>
        </div>

        <div className="deck__block">
          <Segmented<'stay' | 'box'>
            legend="Pit wall"
            value={decision.box ? 'box' : 'stay'}
            onChange={(v) => onChange({ box: v === 'box' })}
            options={[
              { value: 'stay', label: 'Stay out', hint: <>Keep the {COMPOUNDS[player.tyre.compound].name.toLowerCase()}s</> },
              {
                value: 'box',
                label: (
                  <>
                    <Wrench size={14} aria-hidden="true" /> Box this lap
                  </>
                ),
                ariaLabel: 'Box this lap',
                disabled: finalLap,
                hint: rejoin ? <>Pit loss ≈ {rejoin.pitLoss.toFixed(1)} s</> : <>Not on the final lap</>,
              },
            ]}
          />

          {decision.box && !finalLap && (
            <fieldset className="compounds">
              <legend className="segmented__legend">Fit</legend>
              <div className="compounds__grid">
                {COMPOUND_ORDER.map((id) => {
                  const sets = player.allocation[id];
                  const delta = boxDelta(id);
                  const checked = decision.compound === id;
                  return (
                    <label key={id} className={`compound${checked ? ' is-checked' : ''}${sets <= 0 ? ' is-disabled' : ''}`}>
                      <input
                        type="radio"
                        name="compound"
                        value={id}
                        checked={checked}
                        disabled={sets <= 0}
                        onChange={() => onChange({ compound: id })}
                      />
                      <TyreBadge compound={id} size={26} />
                      <span className="compound__name">{COMPOUNDS[id].name}</span>
                      <span className="compound__sets">{sets > 0 ? `${sets} new set${sets > 1 ? 's' : ''}` : 'None left'}</span>
                      {showProjections && delta !== null && sets > 0 && (
                        <span className={`compound__delta${delta < 0.05 ? ' is-best' : ''}`}>{delta < 0.05 ? 'Best est.' : formatDelta(delta)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {showProjections && !finalLap && (
            <div className="deck__estimates">
              {pitNow !== null && (
                <p>
                  <span className="muted">Box now vs stay out</span>{' '}
                  <strong className={pitNow < 0 ? 'is-good' : 'is-bad'}>{formatDelta(pitNow)}</strong>{' '}
                  <span className="muted">estimate</span>
                </p>
              )}
              {rejoin && (
                <p>
                  <span className="muted">If you box: rejoin about</span> <strong>P{rejoin.position}</strong>
                  {rejoin.aheadId && rejoin.gapAhead !== null && (
                    <span className="muted">
                      , {rejoin.gapAhead.toFixed(1)} s behind {getDriver(rejoin.aheadId).code}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {decisionError && (
        <p className="deck__error" role="alert">
          <CircleAlert size={16} aria-hidden="true" /> {decisionError}
        </p>
      )}

      <div className="deck__actions">
        <button type="button" className="btn btn--primary btn--xl advance" onClick={onAdvance} disabled={!!decisionError} aria-keyshortcuts="N">
          <span className="btn__stack">
            <span className="btn__label">{finalLap ? 'Run final lap' : 'Advance lap'}</span>
            <span className="btn__sub">
              {decision.box ? `Lap ${upcoming}, then box for ${COMPOUNDS[decision.compound].name}` : `Lap ${upcoming} of ${race.totalLaps}`}
            </span>
          </span>
        </button>
        <p className="deck__keys muted">
          Keys: <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> pace, <kbd>B</kbd> box, <kbd>E</kbd> boost, <kbd>N</kbd> advance
        </p>
      </div>
    </section>
  );
}
