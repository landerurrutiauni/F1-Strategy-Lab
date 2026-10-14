import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Flag, Gauge, Play, Timer } from 'lucide-react';
import { CircuitMap } from '../../components/CircuitMap';
import { Panel } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { TyreBadge } from '../../components/TyreBadge';
import { WeatherIcon } from '../../components/WeatherIcon';
import { Meter, ResultTable, Timesheet } from '../../components/season/SeasonTables';
import { SPRINT_LAPS } from '../../game/constants';
import { getCircuit } from '../../game/data/circuits';
import { COMPOUNDS, COMPOUND_ORDER } from '../../game/data/tyres';
import { getDriver, getTeam } from '../../game/data/teams';
import { createRace, getPlayerCar } from '../../game/engine';
import { formatDelta, formatLapTime } from '../../game/format';
import { evaluateStrategies, planLabel } from '../../game/projection';
import { SESSION_INFO, WEATHER_LABEL, segmentName } from '../../game/season/calendar';
import {
  completeQualifying,
  currentSession,
  ensureQualifying,
  gridFor,
  playerInQualifying,
  raceConfigFor,
  recordRace,
  runPracticeSession,
  runQualifying,
  simulateWithStrategist,
} from '../../game/season/season';
import { PRACTICE_PROGRAMMES, QUALI_CUTS, QUALI_PLANS, allowedCompounds, preparationEffects, suggestedQualiChoice } from '../../game/season/sessions';
import type { PracticeProgramme, QualiPlan, QualiSessionId, QualifyingState, SeasonState, SessionId, SessionWeather } from '../../game/season/types';
import { compoundPace, fastestCompoundFor } from '../../game/tyreModel';
import type { CompoundId, RaceConfig } from '../../game/types';
import { describeScenarioForecast } from '../../game/weather';
import type { SeasonController } from '../../hooks/useSeason';

interface WeekendPanelProps {
  season: SeasonState;
  controller: SeasonController;
  onStartRace: (config: RaceConfig) => void;
  resumeLap: number | null;
}

const weatherIconProps = (w: SessionWeather | undefined) =>
  !w || w.scenario === 'dry' ? { rain: 0, wetness: 0 } : w.scenario === 'variable' ? { rain: 0.1, wetness: w.wetness } : { rain: 0.5, wetness: w.wetness };

export function WeekendPanel({ season, controller, onStartRace, resumeLap }: WeekendPanelProps) {
  const weekend = season.weekend!;
  const circuit = getCircuit(weekend.circuitId);
  const session = currentSession(season);
  const prepRace = preparationEffects(weekend.prep, 'race');
  const prepQuali = preparationEffects(weekend.prep, 'quali');
  const lastDone = weekend.next > 0 ? weekend.sessions[weekend.next - 1] : null;

  return (
    <div className="season-main">
      <section className="panel weekend-head" aria-labelledby="weekend-title">
        <div className="weekend-head__map">
          <CircuitMap circuit={circuit} variant="thumb" title={`${circuit.fullName} layout`} />
        </div>
        <div>
          <p className="weekend-head__kicker">
            Round {circuit.round} of 23 · {circuit.weekend}
            {circuit.sprint && <span className="tag tag--sprint">Sprint weekend</span>}
          </p>
          <h2 id="weekend-title" className="weekend-head__title display">
            {circuit.grandPrix}
          </h2>
          <p className="muted">
            {circuit.fullName}, {circuit.region}. {circuit.summary}
          </p>
        </div>
      </section>

      <ol className="session-track" aria-label="Weekend sessions">
        {weekend.sessions.map((id, i) => {
          const done = i < weekend.next;
          const current = i === weekend.next;
          const w = weekend.weather[id];
          return (
            <li key={id} className={`session-chip${done ? ' is-done' : ''}${current ? ' is-current' : ''}`} aria-current={current ? 'step' : undefined}>
              <span className="session-chip__name">
                {done && <Check size={14} aria-hidden="true" />} {SESSION_INFO[id].name}
              </span>
              <span className="session-chip__day">
                <WeatherIcon {...weatherIconProps(w)} size={14} /> {SESSION_INFO[id].day} · {w ? WEATHER_LABEL[w.scenario] : ''}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="season-split">
        <div className="season-stack">
          {session === 'fp1' || session === 'fp2' || session === 'fp3' ? (
            <PracticeView season={season} controller={controller} session={session} />
          ) : session === 'quali' || session === 'sprint-quali' ? (
            <QualifyingView season={season} controller={controller} session={session} />
          ) : session === 'sprint' || session === 'race' ? (
            <RaceStartView season={season} controller={controller} session={session} onStartRace={onStartRace} resumeLap={resumeLap} />
          ) : null}
        </div>

        <Panel title="Weekend preparation" icon={<Gauge size={16} />}>
          <div className="meters">
            <Meter label="Setup" value={weekend.prep.setup} effect={`${formatDelta(prepRace.pace, 2)} per lap in qualifying and races`} />
            <Meter label="Tyre knowledge" value={weekend.prep.tyres} effect={`${Math.round((1 - prepRace.wear) * 100)}% less tyre wear in races`} />
            <Meter label="Qualifying preparation" value={weekend.prep.quali} effect={`${formatDelta(prepQuali.pace - prepRace.pace, 2)} extra on a qualifying lap`} />
          </div>
          <p className="field__help">Practice sessions build these up. {circuit.sprint ? 'Sprint weekends have only one practice session, so choose carefully.' : ''}</p>
        </Panel>
      </div>

      {lastDone && <SessionResult season={season} session={lastDone} />}
    </div>
  );
}

function PracticeView({ season, controller, session }: { season: SeasonState; controller: SeasonController; session: 'fp1' | 'fp2' | 'fp3' }) {
  const [programme, setProgramme] = useState<PracticeProgramme>('setup');
  const weather = season.weekend!.weather[session]!;
  return (
    <Panel title={`${SESSION_INFO[session].name}: run plan`} icon={<Timer size={16} />}>
      <p className="session-weather">
        <WeatherIcon {...weatherIconProps(weather)} /> {WEATHER_LABEL[weather.scenario]}
        {weather.wetness > 0.35 ? ': a wet track limits useful dry running.' : '.'}
      </p>
      <Segmented<PracticeProgramme>
        legend="Programme"
        hideLegend
        layout="grid"
        value={programme}
        onChange={setProgramme}
        options={(Object.keys(PRACTICE_PROGRAMMES) as PracticeProgramme[]).map((id) => ({ value: id, label: PRACTICE_PROGRAMMES[id].name, hint: PRACTICE_PROGRAMMES[id].detail }))}
      />
      <div className="season-actions">
        <button type="button" className="btn btn--primary" onClick={() => controller.update((s) => runPracticeSession(s, programme))}>
          <Play size={16} aria-hidden="true" />
          <span className="btn__label">Run {SESSION_INFO[session].short}</span>
        </button>
      </div>
    </Panel>
  );
}

function QualifyingView({ season, controller, session }: { season: SeasonState; controller: SeasonController; session: QualiSessionId }) {
  const q = season.weekend!.qualifying[session];
  useEffect(() => {
    if (!q) controller.update(ensureQualifying);
  }, [q, controller]);
  if (!q) return null;
  // A fresh form for every segment, so the default tyre always suits that segment's track.
  return <QualifyingSegment key={`${session}-${q.segments.length}`} season={season} controller={controller} session={session} q={q} />;
}

function QualifyingSegment({ season, controller, session, q }: { season: SeasonState; controller: SeasonController; session: QualiSessionId; q: QualifyingState }) {
  const index = (q.segments.length + 1) as 1 | 2 | 3;
  const wetness = q.wetness[index - 1] ?? 0;
  const allowed = allowedCompounds(session, index, wetness);
  const suggested = suggestedQualiChoice(session, index, wetness);
  const [compound, setCompound] = useState<CompoundId>(suggested.compound);
  const [plan, setPlan] = useState<QualiPlan>('standard');
  const chosen = allowed.includes(compound) ? compound : suggested.compound;
  const stillIn = playerInQualifying(season, session);
  const last = q.segments[q.segments.length - 1];
  const player = season.config.playerDriverId;
  const fastest = fastestCompoundFor(wetness, allowed);

  return (
    <Panel title={`${SESSION_INFO[session].name}: ${stillIn ? segmentName(session, index) : 'knocked out'}`} icon={<Timer size={16} />}>
      {stillIn ? (
        <>
          <p className="session-weather">
            <WeatherIcon {...weatherIconProps({ scenario: wetness > 0.4 ? 'rainy' : wetness > 0 ? 'variable' : 'dry', wetness })} />{' '}
            {wetness <= 0.02 ? 'Dry track.' : `Track ${Math.round(wetness * 100)}% wet: ${COMPOUNDS[fastest].name} is the quickest tyre.`}{' '}
            {index < 3 ? `The slowest six are knocked out; the top ${QUALI_CUTS[index - 1]} go through.` : 'Top ten shoot-out for pole.'}
          </p>
          <fieldset className="field">
            <legend className="field__label">Tyre for {segmentName(session, index)}</legend>
            <div className="compounds__grid">
              {allowed.map((id) => {
                const delta = compoundPace(id, wetness) - compoundPace(fastest, wetness);
                return (
                  <label key={id} className={`compound${chosen === id ? ' is-checked' : ''}`}>
                    <input type="radio" name="quali-compound" value={id} checked={chosen === id} onChange={() => setCompound(id)} />
                    <TyreBadge compound={id} size={24} />
                    <span className="compound__name">{COMPOUNDS[id].name}</span>
                    <span className={`compound__delta${delta < 0.05 ? ' is-best' : ''}`}>{delta < 0.05 ? 'Quickest' : formatDelta(delta, 2)}</span>
                  </label>
                );
              })}
            </div>
            {session === 'sprint-quali' && wetness <= 0.15 && <p className="field__help">Sprint Qualifying rules: mediums in SQ1 and SQ2, softs in SQ3.</p>}
            {session === 'quali' && index < 3 && wetness <= 0.15 && (
              <p className="field__help">Getting through on mediums saves a new set of softs for the Grand Prix ({q.savedSoftSets}/2 saved so far).</p>
            )}
          </fieldset>
          <Segmented<QualiPlan>
            legend="Run plan"
            layout="grid"
            value={plan}
            onChange={setPlan}
            options={(Object.keys(QUALI_PLANS) as QualiPlan[]).map((id) => ({ value: id, label: QUALI_PLANS[id].name, hint: QUALI_PLANS[id].detail }))}
          />
          <div className="season-actions">
            <button type="button" className="btn btn--primary" onClick={() => controller.update((s) => runQualifying(s, { compound: chosen, plan }))}>
              <Play size={16} aria-hidden="true" />
              <span className="btn__label">Run {segmentName(session, index)}</span>
            </button>
          </div>
        </>
      ) : (
        <div className="season-actions">
          <p>
            {getDriver(player).name} is out in {segmentName(session, q.segments.findIndex((s) => s.eliminated.includes(player)) + 1)} and will start P
            {(last?.entries.findIndex((e) => e.driverId === player) ?? 0) + 1}.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => controller.update(completeQualifying)}>
            <Play size={16} aria-hidden="true" />
            <span className="btn__label">Finish the session</span>
          </button>
        </div>
      )}
      {last && (
        <div className="segment-result">
          <h3 className="segment-result__title">{segmentName(session, last.index)} times</h3>
          <Timesheet
            entries={last.entries}
            playerDriverId={player}
            caption={`${segmentName(session, last.index)} classification`}
            cutAfter={last.index < 3 ? QUALI_CUTS[last.index - 1] : undefined}
          />
        </div>
      )}
    </Panel>
  );
}

function RaceStartView({
  season,
  controller,
  session,
  onStartRace,
  resumeLap,
}: {
  season: SeasonState;
  controller: SeasonController;
  session: 'sprint' | 'race';
  onStartRace: (config: RaceConfig) => void;
  resumeLap: number | null;
}) {
  const weekend = season.weekend!;
  const circuit = getCircuit(weekend.circuitId);
  const grid = gridFor(season, session) ?? [];
  const player = season.config.playerDriverId;
  const gridPos = grid.indexOf(player) + 1;
  const weather = weekend.weather[session]!;
  const laps = session === 'sprint' ? SPRINT_LAPS[season.config.raceLaps] : season.config.raceLaps;

  // Same pre-race analysis as the quick-race briefing: projected race time for each start tyre.
  const options = useMemo(() => {
    return COMPOUND_ORDER.map((compound) => {
      const config = raceConfigFor(season, compound);
      if (!config) return { compound, total: Infinity, plan: '' };
      const race = createRace(config);
      const outlook = evaluateStrategies(race, getPlayerCar(race).id);
      return { compound, total: outlook?.best.totalTime ?? Infinity, plan: outlook ? planLabel(outlook.best.stops) : '' };
    }).sort((a, b) => a.total - b.total);
  }, [season]);
  const [start, setStart] = useState<CompoundId>(() => options[0]?.compound ?? 'medium');
  const best = options[0];
  const chosen = options.find((o) => o.compound === start);
  const config = raceConfigFor(season, start);

  return (
    <Panel title={`${session === 'sprint' ? 'Sprint' : 'Grand Prix'}: ${laps} laps`} icon={<Flag size={16} />}>
      <p className="session-weather">
        <WeatherIcon {...weatherIconProps(weather)} /> {describeScenarioForecast(weather.scenario, circuit)}
      </p>
      <p>
        <strong>{getDriver(player).name}</strong> starts <strong>P{gridPos}</strong> of {grid.length}.{' '}
        {session === 'sprint'
          ? 'No compulsory pit stop in the Sprint; points for the top eight (8 to 1).'
          : 'Two dry compounds are compulsory in a dry race; points for the top ten (25 to 1).'}
      </p>
      <fieldset className="field">
        <legend className="field__label">Starting tyre</legend>
        <div className="compounds__grid compounds__grid--start">
          {COMPOUND_ORDER.map((id) => {
            const o = options.find((x) => x.compound === id);
            const delta = o && best ? o.total - best.total : null;
            return (
              <label key={id} className={`compound${start === id ? ' is-checked' : ''}`}>
                <input type="radio" name="season-start" value={id} checked={start === id} onChange={() => setStart(id)} />
                <TyreBadge compound={id} size={24} />
                <span className="compound__name">{COMPOUNDS[id].name}</span>
                {delta !== null && Number.isFinite(delta) && (
                  <span className={`compound__delta${delta < 0.05 ? ' is-best' : ''}`}>{delta < 0.05 ? 'Best est.' : formatDelta(delta)}</span>
                )}
              </label>
            );
          })}
        </div>
        {resumeLap && <p className="field__help">This race is already under way, so the tyre you started on stays.</p>}
        {chosen && <p className="field__help">Estimated plan from the {COMPOUNDS[start].name}: {chosen.plan.toLowerCase()} (an estimate before traffic and Safety Cars).</p>}
      </fieldset>
      <div className="season-actions">
        <button type="button" className="btn btn--primary btn--xl" disabled={!config} onClick={() => config && onStartRace(config)}>
          <Play size={18} aria-hidden="true" />
          <span className="btn__label">{resumeLap ? `Resume on lap ${resumeLap}` : 'Go to the pit wall'}</span>
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={!config || resumeLap !== null}
          onClick={() => config && controller.update((s) => recordRace(s, simulateWithStrategist(createRace(config)), true))}
        >
          <Bot size={16} aria-hidden="true" /> Let the strategist run it
        </button>
      </div>
      <details className="advanced">
        <summary>Starting grid</summary>
        <ol className="grid-list">
          {grid.map((id, i) => (
            <li key={id} className={id === player ? 'is-player' : undefined}>
              <span className="num">{i + 1}</span> {getDriver(id).name}
            </li>
          ))}
        </ol>
      </details>
    </Panel>
  );
}

/** Result of the latest finished session of the weekend. */
function SessionResult({ season, session }: { season: SeasonState; session: SessionId }) {
  const weekend = season.weekend!;
  const player = season.config.playerDriverId;
  if (session === 'fp1' || session === 'fp2' || session === 'fp3') {
    const result = weekend.practice.find((p) => p.session === session);
    if (!result) return null;
    return (
      <Panel title={`${SESSION_INFO[session].name} classification`}>
        <ul className="notes">
          {result.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <Timesheet entries={result.entries} playerDriverId={player} caption={`${SESSION_INFO[session].name} classification`} showLaps />
      </Panel>
    );
  }
  if (session === 'quali' || session === 'sprint-quali') {
    const q = weekend.qualifying[session];
    if (!q?.grid) return null;
    return (
      <Panel title={`${SESSION_INFO[session].name} result`}>
        <QualiResultTable q={q} playerDriverId={player} />
      </Panel>
    );
  }
  const result = session === 'sprint' ? weekend.sprint : weekend.race;
  if (!result) return null;
  return (
    <Panel title={`${SESSION_INFO[session].name} result${result.simulated ? ' (run by the strategist)' : ''}`}>
      <ResultTable result={result} playerDriverId={player} caption={`${SESSION_INFO[session].name} classification`} />
    </Panel>
  );
}

export function QualiResultTable({ q, playerDriverId }: { q: QualifyingState; playerDriverId: string }) {
  const timeIn = (seg: number, id: string) => q.segments[seg]?.entries.find((e) => e.driverId === id)?.time;
  return (
    <div className="table-scroll">
      <table className="table table--compact">
        <caption className="visually-hidden">Qualifying result</caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Driver</th>
            {[1, 2, 3].map((i) => (
              <th key={i} scope="col" className="num">
                {segmentName(q.session, i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(q.grid ?? []).map((id, i) => (
            <tr key={id} className={`${id === playerDriverId ? 'is-player' : ''}${i + 1 === 10 || i + 1 === 16 ? ' is-cut' : ''}`}>
              <td>{i + 1}</td>
              <td>
                <span className="team-dot" style={{ background: getTeam(getDriver(id).teamId).color }} aria-hidden="true" /> {getDriver(id).name}
              </td>
              {[0, 1, 2].map((seg) => {
                const t = timeIn(seg, id);
                const took = q.segments[seg]?.entries.some((e) => e.driverId === id);
                return (
                  <td key={seg} className="num">
                    {!took ? '' : t === null || t === undefined ? 'No time' : formatLapTime(t)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
