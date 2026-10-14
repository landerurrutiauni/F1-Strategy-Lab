import { useMemo, useState } from 'react';
import { ArrowLeft, CircleCheck, CircleX, Flag, House, ListChecks, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { StintChart } from '../components/StintChart';
import { Telemetry } from '../components/race/Telemetry';
import { RaceFeed } from '../components/race/RaceFeed';
import { TyreBadge } from '../components/TyreBadge';
import { COMPOUNDS } from '../game/data/tyres';
import { getCircuit } from '../game/data/circuits';
import { getDriver, getTeam } from '../game/data/teams';
import { getPlayerCar, playerEngineer } from '../game/engine';
import { formatDelta, formatLapTime, formatRaceTime } from '../game/format';
import { rateStrategy } from '../game/rating';
import type { RaceState } from '../game/types';
import type { SaveStatus } from '../hooks/useRaceController';

interface ResultsScreenProps {
  race: RaceState;
  saveStatus: SaveStatus;
  onRaceAgain: () => void;
  onMenu: () => void;
}

export function ResultsScreen({ race, saveStatus, onRaceAgain, onMenu }: ResultsScreenProps) {
  const [showSummary, setShowSummary] = useState(false);
  const rating = useMemo(() => rateStrategy(race), [race]);
  const circuit = getCircuit(race.config.circuitId);
  const player = getPlayerCar(race);
  const driver = getDriver(player.driverId);
  const classification = race.classification ?? [];
  const entry = classification.find((e) => e.carId === player.id);
  const winner = classification[0];
  const winnerCar = race.cars.find((c) => c.id === winner?.carId);
  const pitLoss = player.pitStops.reduce((s, p) => s + p.totalLoss, 0);
  const majorEvents = race.events.filter((e) => e.major && e.kind !== 'start');
  const finished = entry?.status === 'finished';

  return (
    <div className="page results">
      <header className="page__head">
        <button type="button" className="btn btn--ghost btn--small" onClick={onMenu}>
          <ArrowLeft size={16} aria-hidden="true" /> Menu
        </button>
        <h1 className="page__title display">{circuit.grandPrix} result</h1>
      </header>

      <main id="main" tabIndex={-1} className="results__layout">
        <section className="results__hero" aria-labelledby="result-title">
          <div className="results__position">
            <span className="results__pos-label">Finished</span>
            <span className="results__pos display" id="result-title">
              {finished ? `P${entry?.position}` : 'DNF'}
            </span>
            <span className="muted">of {race.cars.length}</span>
          </div>
          <div className="results__summary">
            <p className="results__headline">
              {finished
                ? entry?.position === 1
                  ? `${driver.name} wins the ${circuit.grandPrix}.`
                  : `${driver.name} finishes P${entry?.position}. ${winnerCar ? getDriver(winnerCar.driverId).name : ''} wins.`
                : `${driver.name} retired on lap ${player.retiredLap}: ${player.retiredReason?.toLowerCase()}.`}
            </p>
            <dl className="readouts readouts--wide">
              <div>
                <dt>Race time</dt>
                <dd className="num">{finished ? formatRaceTime(entry?.totalTime) : '–'}</dd>
              </div>
              <div>
                <dt>Gap to winner</dt>
                <dd className="num">
                  {!finished ? '–' : entry?.position === 1 ? 'Winner' : entry?.lapsDown ? `+${entry.lapsDown} lap${entry.lapsDown > 1 ? 's' : ''}` : formatDelta(entry?.gapToWinner ?? 0)}
                </dd>
              </div>
              <div>
                <dt>Grid to flag</dt>
                <dd className="num">
                  P{player.gridPosition} to {finished ? `P${entry?.position}` : 'DNF'}
                </dd>
              </div>
              <div>
                <dt>Pit stops</dt>
                <dd className="num">
                  {player.pitStops.length} ({pitLoss.toFixed(1)} s in the pits)
                </dd>
              </div>
            </dl>
            <p className={`save-status save-status--${saveStatus.kind}`} role="status">
              {saveStatus.kind === 'saved' && (
                <>
                  <CircleCheck size={16} aria-hidden="true" /> Saved to your records.
                </>
              )}
              {saveStatus.kind === 'error' && (
                <>
                  <CircleX size={16} aria-hidden="true" /> Not saved: {saveStatus.message}
                </>
              )}
              {saveStatus.kind === 'idle' && 'This race was not saved.'}
            </p>
          </div>
          <div className={`grade grade--${rating.grade}`} aria-label={`Strategy rating ${rating.grade}, ${rating.score} out of 100`}>
            <span className="grade__letter display">{rating.grade}</span>
            <span className="grade__score num">{rating.score}/100</span>
            <span className="grade__label">Strategy rating</span>
          </div>
        </section>

        <div className="results__actions">
          <button type="button" className="btn btn--primary" onClick={onRaceAgain}>
            <RotateCcw size={16} aria-hidden="true" />
            <span className="btn__label">Race again</span>
          </button>
          <button type="button" className="btn btn--secondary" aria-expanded={showSummary} aria-controls="race-summary" onClick={() => setShowSummary((v) => !v)}>
            <ListChecks size={16} aria-hidden="true" /> {showSummary ? 'Hide race summary' : 'Inspect race summary'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onMenu}>
            <House size={16} aria-hidden="true" /> Main menu
          </button>
        </div>

        <section className="panel results__rating" aria-labelledby="rating-title">
          <h2 className="panel__title" id="rating-title">
            Strategy rating
          </h2>
          <p className="results__rating-headline">{rating.headline}</p>
          <p className="muted">The rating scores the decisions you controlled. Luck is listed separately and does not change the score.</p>
          <ul className="factors">
            {rating.factors.map((f) => (
              <li key={f.id} className="factor">
                <span className="factor__label">
                  {f.label} <span className="muted">({Math.round(f.weight * 100)}%)</span>
                </span>
                <span className="factor__bar" aria-hidden="true">
                  <span className="factor__fill" style={{ width: `${f.score}%` }} />
                </span>
                <span className="factor__score num">{f.score}</span>
                <span className="factor__summary">{f.summary}</span>
              </li>
            ))}
          </ul>
          <h3 className="intel__sub">Key decisions</h3>
          {rating.keyDecisions.length === 0 ? (
            <p className="muted">No single decision swung the race by more than a couple of seconds.</p>
          ) : (
            <ul className="decisions">
              {rating.keyDecisions.map((k, i) => (
                <li key={i} className={`decision decision--${k.effect}`}>
                  {k.effect === 'helped' ? <ThumbsUp size={16} aria-hidden="true" /> : <ThumbsDown size={16} aria-hidden="true" />}
                  <span>
                    <strong>{k.title}.</strong> {k.detail}
                    <span className="visually-hidden">{k.effect === 'helped' ? ' This helped.' : ' This cost time.'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="intel__sub">Luck and circumstances</h3>
          {rating.luck.length === 0 ? (
            <p className="muted">Nothing outside your control had a big effect.</p>
          ) : (
            <ul className="decisions">
              {rating.luck.map((l, i) => (
                <li key={i} className={`decision decision--${l.effect === 'good' ? 'helped' : 'harmed'}`}>
                  {l.effect === 'good' ? <ThumbsUp size={16} aria-hidden="true" /> : <ThumbsDown size={16} aria-hidden="true" />}
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel results__stints" aria-labelledby="stints-title">
          <h2 className="panel__title" id="stints-title">
            Tyre strategies
          </h2>
          <p className="results__your-stints">
            Your stints:{' '}
            {player.stints
              .filter((s) => s.laps > 0)
              .map((s, i) => (
                <span key={i} className="plan__stop">
                  <TyreBadge compound={s.compound} size={16} /> {COMPOUNDS[s.compound].name} {s.laps} lap{s.laps > 1 ? 's' : ''}
                  {s.endLap !== null && s.endLap < race.totalLaps ? `, ${Math.round(s.endWear)}% worn at the stop` : ''}
                </span>
              ))}
          </p>
          <StintChart race={race} />
        </section>

        <section className="panel results__table" aria-labelledby="class-title">
          <h2 className="panel__title" id="class-title">
            Final classification
          </h2>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Pos</th>
                  <th scope="col">Driver</th>
                  <th scope="col">Team</th>
                  <th scope="col" className="num">Time / gap</th>
                  <th scope="col" className="num">Stops</th>
                  <th scope="col" className="num">Best lap</th>
                </tr>
              </thead>
              <tbody>
                {classification.map((e) => {
                  const car = race.cars.find((c) => c.id === e.carId)!;
                  const dr = getDriver(car.driverId);
                  const tm = getTeam(car.teamId);
                  return (
                    <tr key={e.carId} className={car.isPlayer ? 'is-player' : undefined}>
                      <td className="num">{e.status === 'finished' ? e.position : 'DNF'}</td>
                      <td>
                        <span className="team-dot" style={{ background: tm.color }} aria-hidden="true" /> {dr.name}
                        {car.isPlayer && <span className="visually-hidden"> (your car)</span>}
                      </td>
                      <td className="muted">{tm.name}</td>
                      <td className="num">
                        {e.status === 'retired'
                          ? `Out, lap ${e.lapsCompleted + 1}`
                          : e.position === 1
                            ? formatRaceTime(e.totalTime)
                            : e.lapsDown > 0
                              ? `+${e.lapsDown} lap${e.lapsDown > 1 ? 's' : ''}`
                              : `+${(e.gapToWinner ?? 0).toFixed(1)}`}
                        {e.penaltyTime > 0 && <span className="tag tag--danger">+{e.penaltyTime} s pen.</span>}
                      </td>
                      <td className="num">{e.pitStops}</td>
                      <td className="num">{formatLapTime(e.bestLap)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="results__telemetry">
          <Telemetry race={race} compareId={winner?.carId !== player.id ? winner?.carId : classification[1]?.carId} />
        </div>

        <section className="panel results__events" aria-labelledby="events-title">
          <h2 className="panel__title" id="events-title">
            <Flag size={16} aria-hidden="true" /> Major events
          </h2>
          {majorEvents.length === 0 ? (
            <p className="muted">A clean, quiet race.</p>
          ) : (
            <ul className="events">
              {majorEvents.map((e) => (
                <li key={e.id}>
                  <span className="feed__lap">L{e.lap}</span> <strong>{e.title}.</strong> <span className="muted">{e.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {showSummary && (
          <section className="results__summary-detail" id="race-summary" aria-labelledby="summary-title">
            <h2 className="panel__title" id="summary-title">
              Race summary
            </h2>
            <div className="panel">
              <h3 className="intel__sub">Your laps</h3>
              <div className="table-scroll">
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th scope="col">Lap</th>
                      <th scope="col">Pos</th>
                      <th scope="col" className="num">Lap time</th>
                      <th scope="col">Tyre</th>
                      <th scope="col" className="num">Wear</th>
                      <th scope="col">Pace</th>
                      <th scope="col">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {player.laps.map((l) => {
                      const d = race.decisionLog.find((x) => x.lap === l.lap);
                      return (
                        <tr key={l.lap}>
                          <td className="num">{l.lap}</td>
                          <td className="num">P{l.position}</td>
                          <td className="num">{formatLapTime(l.lapTime)}</td>
                          <td>
                            <TyreBadge compound={l.compound} size={16} />
                          </td>
                          <td className="num">{Math.round(l.wear)}%</td>
                          <td>{l.safetyCar ? 'Safety Car' : l.pace[0].toUpperCase() + l.pace.slice(1)}</td>
                          <td className="muted">
                            {[l.pitted ? 'Pit stop' : null, d && d.regret >= 1 ? `Est. ${d.regret.toFixed(1)} s off best plan` : null, d?.decision.boost ? 'Boost' : null]
                              .filter(Boolean)
                              .join(', ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <RaceFeed events={race.events} engineer={playerEngineer(race)} currentLap={-1} limit={500} />
          </section>
        )}
      </main>
    </div>
  );
}
