import { useId, useState, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, Megaphone, Trophy } from 'lucide-react';
import { Panel } from '../../components/Panel';
import { ConstructorStandingsTable, DriverStandingsTable, ResultTable } from '../../components/season/SeasonTables';
import { CIRCUITS, getCircuit } from '../../game/data/circuits';
import { getDriver, getTeam } from '../../game/data/teams';
import { ordinal } from '../../game/format';
import { constructorStandings, driverStandings, playerTeamId } from '../../game/season/season';
import type { SeasonState } from '../../game/season/types';
import type { RaceConfig } from '../../game/types';
import type { SeasonController } from '../../hooks/useSeason';
import { TestingPanel } from './TestingPanel';
import { WeekendPanel } from './WeekendPanel';

interface SeasonScreenProps {
  controller: SeasonController;
  /** Lap to resume at when the current Sprint or Grand Prix is already under way. */
  resumeLap: number | null;
  onMenu: () => void;
  onNewSeason: () => void;
  onStartRace: (config: RaceConfig) => void;
}

type Tab = 'weekend' | 'standings' | 'calendar';

export function SeasonScreen({ controller, resumeLap, onMenu, onNewSeason, onStartRace }: SeasonScreenProps) {
  const season = controller.season!;
  const [tab, setTab] = useState<Tab>('weekend');
  const baseId = useId();
  const driver = getDriver(season.config.playerDriverId);
  const team = getTeam(driver.teamId);
  const drivers = driverStandings(season);
  const mine = drivers.find((r) => r.id === driver.id)!;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'weekend', label: season.phase === 'testing' ? 'Testing' : season.phase === 'finished' ? 'Season review' : 'This weekend' },
    { id: 'standings', label: 'Standings' },
    { id: 'calendar', label: 'Calendar' },
  ];

  return (
    <div className="page season">
      <header className="page__head">
        <button type="button" className="btn btn--ghost btn--small" onClick={onMenu}>
          <ArrowLeft size={16} aria-hidden="true" /> Menu
        </button>
        <h1 className="page__title display">2026 season</h1>
      </header>

      <main id="main" tabIndex={-1} className="season__layout">
        <section className="season-bar" aria-label="Your championship">
          <span className="season-bar__driver">
            <span className="team-dot" style={{ background: team.color }} aria-hidden="true" /> #{driver.number} {driver.name}
            <span className="muted"> · {team.name} · engineer {driver.engineer}</span>
          </span>
          <span className="season-bar__stat">
            <span className="muted">Championship</span> <strong className="num">{season.results.length ? ordinal(mine.position) : '–'}</strong>
          </span>
          <span className="season-bar__stat">
            <span className="muted">Points</span> <strong className="num">{mine.points}</strong>
          </span>
          <span className="season-bar__stat">
            <span className="muted">Rounds</span> <strong className="num">{season.results.length}/23</strong>
          </span>
          {!controller.saved && (
            <span className="season-bar__warn" role="status">
              Progress could not be saved in this browser.
            </span>
          )}
        </section>

        <div className="tabs" role="tablist" aria-label="Season views">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${baseId}-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`${baseId}-${t.id}-panel`}
              className={`tabs__tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <TabPanel id={`${baseId}-${tab}`}>
          {tab === 'weekend' &&
            (season.phase === 'testing' ? (
              <TestingPanel season={season} controller={controller} />
            ) : season.phase === 'finished' ? (
              <SeasonReview season={season} onNewSeason={onNewSeason} />
            ) : (
              <div className="season-main">
                <LastRound season={season} />
                <WeekendPanel season={season} controller={controller} onStartRace={onStartRace} resumeLap={resumeLap} />
              </div>
            ))}
          {tab === 'standings' && <Standings season={season} />}
          {tab === 'calendar' && <Calendar season={season} />}
        </TabPanel>
      </main>
    </div>
  );
}

function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={id} className="season__panel">
      {children}
    </div>
  );
}

/** Summary of the round just completed, shown until the next weekend gets going. */
function LastRound({ season }: { season: SeasonState }) {
  const last = season.results[season.results.length - 1];
  if (!last || !season.weekend || season.weekend.next > 0) return null;
  const circuit = getCircuit(last.circuitId);
  const player = season.config.playerDriverId;
  const winner = last.race.rows[0];
  const mine = last.race.rows.find((r) => r.driverId === player)!;
  const sprintPts = last.sprint?.rows.find((r) => r.driverId === player)?.points ?? 0;
  return (
    <Panel title={`Round ${last.round}: ${circuit.grandPrix}`} icon={<Trophy size={16} />} className="last-round">
      <p className="last-round__headline">
        {getDriver(winner.driverId).name} wins.{' '}
        {mine.status === 'retired' ? `${getDriver(player).name} retired (${mine.reason ?? 'retired'}).` : `${getDriver(player).name} finishes P${mine.position}`}
        {mine.status === 'finished' &&
          (mine.points + sprintPts > 0 ? ` (+${mine.points + sprintPts} points${sprintPts ? `, ${sprintPts} of them in the Sprint` : ''}).` : ', outside the points.')}
      </p>
      {season.news.length > 0 && (
        <ul className="notes">
          {season.news.map((n) => (
            <li key={n}>
              <Megaphone size={14} aria-hidden="true" /> {n}
            </li>
          ))}
        </ul>
      )}
      <details className="advanced">
        <summary>Full Grand Prix result</summary>
        <ResultTable result={last.race} playerDriverId={player} caption={`${circuit.grandPrix} result`} />
      </details>
    </Panel>
  );
}

function Standings({ season }: { season: SeasonState }) {
  return (
    <div className="season-split season-split--even">
      <Panel title="Drivers’ championship" icon={<Trophy size={16} />}>
        <DriverStandingsTable rows={driverStandings(season)} playerDriverId={season.config.playerDriverId} />
      </Panel>
      <Panel title="Constructors’ championship" icon={<Trophy size={16} />}>
        <ConstructorStandingsTable rows={constructorStandings(season)} playerTeamId={playerTeamId(season)} />
        <p className="field__help">Points: Grand Prix 25-18-15-12-10-8-6-4-2-1, Sprint 8-7-6-5-4-3-2-1. Ties are broken by Grand Prix results.</p>
      </Panel>
    </div>
  );
}

function Calendar({ season }: { season: SeasonState }) {
  const player = season.config.playerDriverId;
  return (
    <Panel title="2026 calendar" icon={<CalendarDays size={16} />}>
      <div className="table-scroll">
        <table className="table table--compact">
          <caption className="visually-hidden">Season calendar and results</caption>
          <thead>
            <tr>
              <th scope="col">Round</th>
              <th scope="col">Grand Prix</th>
              <th scope="col">Dates</th>
              <th scope="col">Format</th>
              <th scope="col">Pole</th>
              <th scope="col">Winner</th>
              <th scope="col" className="num">
                You
              </th>
            </tr>
          </thead>
          <tbody>
            {CIRCUITS.map((c) => {
              const r = season.results.find((x) => x.round === c.round);
              const mine = r?.race.rows.find((x) => x.driverId === player);
              const current = season.phase === 'weekend' && season.round === c.round;
              return (
                <tr key={c.id} className={current ? 'is-player' : undefined} aria-current={current ? 'step' : undefined}>
                  <td>{c.round}</td>
                  <td>
                    {c.grandPrix}
                    <span className="muted"> · {c.name}</span>
                  </td>
                  <td>{c.weekend}</td>
                  <td>{c.sprint ? <span className="tag tag--sprint">Sprint</span> : 'Standard'}</td>
                  <td>{r?.poleDriverId ? getDriver(r.poleDriverId).code : ''}</td>
                  <td>{r ? getDriver(r.race.rows[0].driverId).name : current ? 'This weekend' : ''}</td>
                  <td className="num">{mine ? (mine.status === 'retired' ? 'DNF' : `P${mine.position}`) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SeasonReview({ season, onNewSeason }: { season: SeasonState; onNewSeason: () => void }) {
  const drivers = driverStandings(season);
  const teams = constructorStandings(season);
  const player = season.config.playerDriverId;
  const mine = drivers.find((r) => r.id === player)!;
  const champion = drivers[0];
  return (
    <div className="season-main">
      <section className="panel season-review" aria-labelledby="review-title">
        <p className="weekend-head__kicker">Season complete · 23 rounds</p>
        <h2 id="review-title" className="weekend-head__title display">
          {champion.id === player ? `${getDriver(player).name} is world champion` : `${getDriver(champion.id).name} is world champion`}
        </h2>
        <p>
          {getTeam(teams[0].id).name} take the constructors’ title with {teams[0].points} points. {getDriver(player).name} finishes {ordinal(mine.position)} with{' '}
          {mine.points} points, {mine.wins} win{mine.wins === 1 ? '' : 's'} and {mine.podiums} podium{mine.podiums === 1 ? '' : 's'}.
        </p>
        <div className="season-actions">
          <button type="button" className="btn btn--primary" onClick={onNewSeason}>
            <Trophy size={16} aria-hidden="true" />
            <span className="btn__label">Start a new season</span>
          </button>
        </div>
      </section>
      <Standings season={season} />
    </div>
  );
}
