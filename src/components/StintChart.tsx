import { COMPOUNDS } from '../game/data/tyres';
import { getDriver, getTeam } from '../game/data/teams';
import type { RaceState } from '../game/types';

/** Horizontal tyre-strategy chart: one bar per car, one segment per stint. */
export function StintChart({ race }: { race: RaceState }) {
  const order = race.classification ?? [...race.cars].sort((a, b) => a.position - b.position).map((c) => ({ carId: c.id, position: c.position }));
  return (
    <div className="stints" role="table" aria-label="Tyre strategy for every car">
      <div className="stints__axis" role="row">
        <span role="columnheader">Driver</span>
        <span role="columnheader" className="stints__scale">
          <span>Lap 1</span>
          <span>Lap {race.totalLaps}</span>
        </span>
      </div>
      {order.map((entry) => {
        const car = race.cars.find((c) => c.id === entry.carId)!;
        const driver = getDriver(car.driverId);
        const stints = car.stints.filter((s) => s.laps > 0);
        return (
          <div key={car.id} className={`stints__row${car.isPlayer ? ' is-player' : ''}`} role="row">
            <span className="stints__driver" role="rowheader">
              <span className="stints__pos">{entry.position}</span>
              <span className="stints__team" style={{ background: getTeam(car.teamId).color }} aria-hidden="true" />
              {driver.code}
            </span>
            <span
              className="stints__bar"
              role="cell"
              aria-label={stints.map((s) => `${COMPOUNDS[s.compound].name} for ${s.laps} lap${s.laps > 1 ? 's' : ''}`).join(', ') + (car.status === 'retired' ? ', retired' : '')}
            >
              {stints.map((s, i) => (
                <span
                  key={i}
                  className={`stints__seg tyre-${s.compound}`}
                  style={{ width: `${(s.laps / race.totalLaps) * 100}%` }}
                  title={`${COMPOUNDS[s.compound].name}: laps ${s.startLap}–${s.startLap + s.laps - 1}`}
                >
                  {s.laps >= 2 ? COMPOUNDS[s.compound].letter : ''}
                </span>
              ))}
              {car.status === 'retired' && <span className="stints__dnf">DNF</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
