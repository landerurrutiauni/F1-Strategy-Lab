import { Flag, LogOut, TriangleAlert } from 'lucide-react';
import { getCircuit } from '../../game/data/circuits';
import type { RaceState } from '../../game/types';
import { rainLabel, wetnessLabel } from '../../game/weather';
import { WeatherIcon } from '../WeatherIcon';

interface RaceHeaderProps {
  race: RaceState;
  onLeave: () => void;
  /** The lights have gone out (the first lap is under way). */
  started?: boolean;
}

export function RaceHeader({ race, onLeave, started = race.lap > 0 }: RaceHeaderProps) {
  const circuit = getCircuit(race.config.circuitId);
  const finished = race.phase === 'finished';
  const sc = race.safetyCar.active;
  const shownLap = finished ? race.totalLaps : Math.min(race.lap + 1, race.totalLaps);
  const status = finished
    ? { label: 'Chequered flag', tone: 'finish', icon: <Flag size={15} aria-hidden="true" /> }
    : sc
      ? { label: 'Safety Car', tone: 'sc', icon: <TriangleAlert size={15} aria-hidden="true" /> }
      : !started
        ? { label: 'Grid', tone: 'grid', icon: <Flag size={15} aria-hidden="true" /> }
        : { label: 'Green flag', tone: 'green', icon: <Flag size={15} aria-hidden="true" /> };

  return (
    <header className="race-header">
      <div className="race-header__brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1 className="race-header__event">
            {circuit.grandPrix}
            {race.config.session === 'sprint' ? ' Sprint' : ''}
          </h1>
          <p className="race-header__venue muted">
            Round {circuit.round}, {circuit.fullName}
          </p>
        </div>
      </div>
      <div className="race-header__lap" aria-label={`Lap ${shownLap} of ${race.totalLaps}`}>
        <span className="race-header__lap-label">Lap</span>
        <span className="race-header__lap-value display">
          {String(shownLap).padStart(2, '0')}
          <span className="race-header__lap-total">/{race.totalLaps}</span>
        </span>
      </div>
      <div className={`status-chip status-chip--${status.tone}`} role="status">
        {status.icon}
        <span>{status.label}</span>
        {sc && <span className="status-chip__extra">{race.safetyCar.lapsRemaining} lap{race.safetyCar.lapsRemaining > 1 ? 's' : ''}</span>}
      </div>
      <div className={`weather-chip${race.weather.rain >= 0.05 ? ' is-rain' : ''}`}>
        <WeatherIcon rain={race.weather.rain} wetness={race.weather.wetness} size={18} />
        <span>
          {rainLabel(race.weather.rain)}
          <span className="muted">, track {wetnessLabel(race.weather.wetness).toLowerCase()}, {race.weather.trackTemp}°C</span>
        </span>
      </div>
      <button type="button" className="btn btn--ghost btn--small race-header__leave" onClick={onLeave}>
        <LogOut size={15} aria-hidden="true" /> Menu
      </button>
    </header>
  );
}
