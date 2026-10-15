import { TyreBadge } from '../TyreBadge';
import { getDriver, getTeam } from '../../game/data/teams';
import { formatLapTime } from '../../game/format';
import type { RaceResult, StandingRow, TimedEntry } from '../../game/season/types';

/** Your driver or drivers (both cars of your team in the career). */
type Mine = string | string[];
const isMine = (mine: Mine, id: string) => (typeof mine === 'string' ? mine === id : mine.includes(id));

function DriverCell({ driverId }: { driverId: string }) {
  const driver = getDriver(driverId);
  return (
    <td>
      <span className="team-dot" style={{ background: getTeam(driver.teamId).color }} aria-hidden="true" /> {driver.name}
    </td>
  );
}

interface TimesheetProps {
  entries: TimedEntry[];
  playerDriverId: Mine;
  caption: string;
  /** Draw a knock-out line below these positions (e.g. 16 in Q1). */
  cutAfter?: number;
  showLaps?: boolean;
}

/** Timesheet for practice, testing and qualifying: best laps and gaps to the fastest. */
export function Timesheet({ entries, playerDriverId, caption, cutAfter, showLaps }: TimesheetProps) {
  const best = entries.find((e) => e.time !== null)?.time ?? null;
  return (
    <div className="table-scroll">
      <table className="table table--compact timesheet">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Driver</th>
            <th scope="col">Tyre</th>
            <th scope="col" className="num">
              Best lap
            </th>
            <th scope="col" className="num">
              Gap
            </th>
            {showLaps && (
              <th scope="col" className="num">
                Laps
              </th>
            )}
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.driverId} className={`${isMine(playerDriverId, e.driverId) ? 'is-player' : ''}${cutAfter && i + 1 === cutAfter ? ' is-cut' : ''}`}>
              <td>{i + 1}</td>
              <DriverCell driverId={e.driverId} />
              <td>
                <TyreBadge compound={e.compound} size={18} />
              </td>
              <td className="num">{e.time === null ? 'No time' : formatLapTime(e.time)}</td>
              <td className="num">{e.time === null || best === null ? '–' : i === 0 ? '' : `+${(e.time - best).toFixed(3)}`}</td>
              {showLaps && <td className="num">{e.laps}</td>}
              <td className="muted">{e.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Classification of a Sprint or Grand Prix with points. */
export function ResultTable({ result, playerDriverId, caption, limit }: { result: RaceResult; playerDriverId: Mine; caption: string; limit?: number }) {
  const rows = limit ? result.rows.filter((r, i) => i < limit || isMine(playerDriverId, r.driverId)) : result.rows;
  return (
    <div className="table-scroll">
      <table className="table table--compact">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Driver</th>
            <th scope="col" className="num">
              Grid
            </th>
            <th scope="col" className="num">
              Result
            </th>
            <th scope="col" className="num">
              Points
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.driverId} className={isMine(playerDriverId, r.driverId) ? 'is-player' : ''}>
              <td>{r.status === 'retired' ? 'DNF' : r.position}</td>
              <DriverCell driverId={r.driverId} />
              <td className="num">{r.grid}</td>
              <td className="num">
                {r.status === 'retired'
                  ? r.reason ?? 'Retired'
                  : r.position === 1
                    ? 'Winner'
                    : r.lapsDown > 0
                      ? `+${r.lapsDown} lap${r.lapsDown > 1 ? 's' : ''}`
                      : r.gap !== null
                        ? `+${r.gap.toFixed(1)} s`
                        : '–'}
              </td>
              <td className="num">{r.points > 0 ? r.points : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DriverStandingsTable({ rows, playerDriverId, limit }: { rows: StandingRow[]; playerDriverId: Mine; limit?: number }) {
  const shown = limit ? rows.filter((r, i) => i < limit || isMine(playerDriverId, r.id)) : rows;
  return (
    <div className="table-scroll">
      <table className="table table--compact">
        <caption className="visually-hidden">Drivers’ championship</caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Driver</th>
            <th scope="col">Team</th>
            <th scope="col" className="num">
              Wins
            </th>
            <th scope="col" className="num">
              Podiums
            </th>
            <th scope="col" className="num">
              Points
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const driver = getDriver(r.id);
            return (
              <tr key={r.id} className={isMine(playerDriverId, r.id) ? 'is-player' : ''}>
                <td>{r.position}</td>
                <DriverCell driverId={r.id} />
                <td className="muted">{getTeam(driver.teamId).name}</td>
                <td className="num">{r.wins}</td>
                <td className="num">{r.podiums}</td>
                <td className="num standings__points">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ConstructorStandingsTable({ rows, playerTeamId }: { rows: StandingRow[]; playerTeamId: string }) {
  return (
    <div className="table-scroll">
      <table className="table table--compact">
        <caption className="visually-hidden">Constructors’ championship</caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Team</th>
            <th scope="col" className="num">
              Wins
            </th>
            <th scope="col" className="num">
              Points
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const team = getTeam(r.id);
            return (
              <tr key={r.id} className={r.id === playerTeamId ? 'is-player' : ''}>
                <td>{r.position}</td>
                <td>
                  <span className="team-dot" style={{ background: team.color }} aria-hidden="true" /> {team.name}
                </td>
                <td className="num">{r.wins}</td>
                <td className="num standings__points">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal level bar with its value and effect in text. */
export function Meter({ label, value, effect }: { label: string; value: number; effect: string }) {
  const pctValue = Math.round(value * 100);
  return (
    <div className="meter">
      <div className="meter__head">
        <span className="meter__label">{label}</span>
        <span className="meter__value num">{pctValue}%</span>
      </div>
      <div className="meter__track" aria-hidden="true">
        <span className="meter__fill" style={{ width: `${pctValue}%` }} />
      </div>
      <p className="meter__effect muted">{effect}</p>
    </div>
  );
}
