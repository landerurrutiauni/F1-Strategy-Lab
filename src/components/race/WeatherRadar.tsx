import { Radar, Thermometer } from 'lucide-react';
import { COMPOUNDS } from '../../game/data/tyres';
import { fastestCompoundFor } from '../../game/tyreModel';
import type { RaceState } from '../../game/types';
import { longRangeRainChance, rainLabel, wetnessLabel } from '../../game/weather';
import { Panel } from '../Panel';
import { TyreBadge } from '../TyreBadge';
import { WeatherIcon } from '../WeatherIcon';

export function WeatherRadar({ race, collapsible }: { race: RaceState; collapsible?: boolean }) {
  const { weather, forecast } = race;
  const best = fastestCompoundFor(weather.wetness);
  const outlook = longRangeRainChance(race);
  return (
    <Panel title="Weather radar" icon={<Radar size={16} />} className="radar" collapsible={collapsible}>
      <div className="radar__now">
        <span className={`radar__icon${weather.rain >= 0.05 ? ' is-rain' : ''}`}>
          <WeatherIcon rain={weather.rain} wetness={weather.wetness} size={28} />
        </span>
        <div>
          <p className="radar__label">{rainLabel(weather.rain)}</p>
          <p className="muted">
            Track {wetnessLabel(weather.wetness).toLowerCase()} ({Math.round(weather.wetness * 100)}% wet)
          </p>
        </div>
        <div className="radar__temp">
          <Thermometer size={14} aria-hidden="true" />
          <span className="num">{weather.trackTemp}°C</span>
          <span className="muted">track</span>
        </div>
      </div>
      <p className="radar__best">
        Quickest tyre now: <TyreBadge compound={best} size={18} /> <strong>{COMPOUNDS[best].name}</strong>
      </p>
      {forecast.length > 0 ? (
        <>
          <ol className="radar__bars" aria-label="Rain forecast by lap">
            {forecast.map((f) => (
              <li key={f.lap} className="radar__bar" aria-label={`Lap ${f.lap}: ${rainLabel(f.rain)}, ${Math.round(f.confidence * 100)}% confidence`}>
                <span className="radar__col" aria-hidden="true">
                  <span className="radar__fill" style={{ height: `${Math.max(3, f.rain * 100)}%`, opacity: 0.45 + f.confidence * 0.55 }} />
                </span>
                <span className="radar__lap">L{f.lap}</span>
                <span className="radar__conf">{Math.round(f.confidence * 100)}%</span>
              </li>
            ))}
          </ol>
          <p className="radar__note muted">
            Bars show expected rain; percentages are radar confidence.
            {outlook !== null && ` Later in the race: ${outlook}% chance of rain.`}
          </p>
        </>
      ) : (
        <p className="muted">{race.phase === 'finished' ? 'The race is over.' : 'No forecast needed: this is the final lap.'}</p>
      )}
    </Panel>
  );
}
