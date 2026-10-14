import { CircleDot } from 'lucide-react';
import { COMPOUNDS, COMPOUND_ORDER } from '../../game/data/tyres';
import { formatDelta } from '../../game/format';
import type { StrategyOutlook } from '../../game/projection';
import type { CarState, PaceMode, RaceState } from '../../game/types';
import { tyreOutlook } from '../../game/view';
import { suitabilityGap } from '../../game/tyreModel';
import { Panel } from '../Panel';
import { TyreBadge } from '../TyreBadge';

interface TyrePanelProps {
  race: RaceState;
  car: CarState;
  pace: PaceMode;
  outlook: StrategyOutlook | null;
}

function wearState(wear: number): { label: string; tone: 'ok' | 'warn' | 'danger' } {
  if (wear >= 85) return { label: 'Failure risk', tone: 'danger' };
  if (wear >= 70) return { label: 'Worn', tone: 'warn' };
  if (wear >= 40) return { label: 'Used', tone: 'ok' };
  return { label: 'Fresh', tone: 'ok' };
}

export function TyrePanel({ race, car, pace, outlook }: TyrePanelProps) {
  const spec = COMPOUNDS[car.tyre.compound];
  const info = tyreOutlook(race, car, pace);
  const state = wearState(car.tyre.wear);
  const mismatch = suitabilityGap(car.tyre.compound, race.weather.wetness);
  const life = Math.max(0, 100 - car.tyre.wear);
  const R = 52;
  const C = 2 * Math.PI * R;
  const lapsLeft = race.totalLaps - race.lap;
  const lifeText = !Number.isFinite(info.usefulLaps)
    ? 'Not wearing'
    : info.usefulLaps === 0
      ? 'Past 80% now'
      : `${info.usefulLaps} lap${info.usefulLaps === 1 ? '' : 's'}${info.usefulLaps >= lapsLeft ? ' (to the flag)' : ''}`;

  return (
    <Panel title="Tyres" icon={<CircleDot size={16} />} className="tyres">
      <div className="tyres__main">
        <svg className={`tyre-gauge tone-${state.tone}`} viewBox="-70 -70 140 140" role="img" aria-label={`${spec.name} tyre, ${Math.round(car.tyre.wear)}% worn, ${state.label}`}>
          <circle r={R + 10} className="tyre-gauge__rubber" />
          <circle r={R} className="tyre-gauge__track" />
          <circle
            r={R}
            className="tyre-gauge__life"
            strokeDasharray={`${(C * life) / 100} ${C}`}
            transform="rotate(-90)"
          />
          <circle r={R - 16} fill="none" stroke={spec.colorVar} strokeWidth={5} />
          <text y={-4} textAnchor="middle" className="tyre-gauge__value">
            {Math.round(car.tyre.wear)}%
          </text>
          <text y={16} textAnchor="middle" className="tyre-gauge__caption">
            worn
          </text>
        </svg>
        <div className="tyres__facts">
          <p className="tyres__compound">
            <TyreBadge compound={car.tyre.compound} size={22} /> {spec.name}
            <span className={`tag tag--${state.tone}`}>{state.label}</span>
          </p>
          <dl className="facts">
            <div>
              <dt>Pace loss from wear</dt>
              <dd>{info.paceLoss < 0.005 ? 'None yet' : `${formatDelta(info.paceLoss, 2)}/lap`}</dd>
            </div>
            <div>
              <dt>Useful life left</dt>
              <dd>{lifeText}</dd>
            </div>
            <div>
              <dt>Stint so far</dt>
              <dd>
                {info.stintLaps} lap{info.stintLaps === 1 ? '' : 's'}
              </dd>
            </div>
            <div>
              <dt>Wear rate at this pace</dt>
              <dd>{info.wearPerLap.toFixed(1)}% per lap</dd>
            </div>
            <div>
              <dt>Next pit window</dt>
              <dd>
                {outlook?.pitWindow
                  ? outlook.pitWindow.start === outlook.pitWindow.end
                    ? `Lap ${outlook.pitWindow.start}`
                    : `Laps ${outlook.pitWindow.start}–${outlook.pitWindow.end}`
                  : 'No stop needed (estimate)'}
              </dd>
            </div>
            {mismatch > 0.5 && (
              <div className="facts__warn">
                <dt>Wrong tyre for the track</dt>
                <dd>{formatDelta(mismatch, 1)}/lap vs best tyre</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
      <div className="sets" aria-label="Fresh sets remaining">
        {COMPOUND_ORDER.map((id) => (
          <span key={id} className={`sets__item${car.allocation[id] === 0 ? ' is-empty' : ''}`} title={`${COMPOUNDS[id].name}: ${car.allocation[id]} new set${car.allocation[id] === 1 ? '' : 's'}`}>
            <TyreBadge compound={id} size={18} />
            <span className="sets__count">×{car.allocation[id]}</span>
          </span>
        ))}
      </div>
    </Panel>
  );
}
