import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Flag, Gauge, Lock, Play, SlidersHorizontal, Timer, Wand2 } from 'lucide-react';
import { CircuitMap } from '../../components/CircuitMap';
import { Panel } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { TyreBadge } from '../../components/TyreBadge';
import { WeatherIcon } from '../../components/WeatherIcon';
import { Meter, ResultTable, Timesheet } from '../../components/season/SeasonTables';
import { getCircuit } from '../../game/data/circuits';
import { COMPOUNDS, COMPOUND_ORDER } from '../../game/data/tyres';
import { getDriver, getTeam } from '../../game/data/teams';
import { createRace, getManagedCars } from '../../game/engine';
import { formatDelta, formatLapTime } from '../../game/format';
import { SETUP_INFO, SETUP_PARAMS, feedbackText, type SetupParam } from '../../game/manager/setup';
import { evaluateStrategies, planLabel } from '../../game/projection';
import { SESSION_INFO, WEATHER_LABEL, segmentName } from '../../game/season/calendar';
import {
  changeSetup,
  completeQualifying,
  currentSession,
  engineerProposal,
  ensureQualifying,
  gridFor,
  managedDrivers,
  managedInQualifying,
  raceConfigFor,
  raceLaps,
  recordRace,
  runPracticeSession,
  runQualifying,
  setupLocked,
  simulateWithStrategist,
} from '../../game/season/season';
import { PRACTICE_PROGRAMMES, QUALI_CUTS, QUALI_PLANS, allowedCompounds, preparationEffects, suggestedQualiChoice } from '../../game/season/sessions';
import type { PracticeProgramme, QualiChoice, QualiPlan, QualiSessionId, QualifyingState, SeasonState, SessionId, SessionWeather } from '../../game/season/types';
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
  const ids = managedDrivers(season);
  const locked = setupLocked(season);

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
            {ids.map((id) => {
              const fb = weekend.setups[id]?.feedback;
              return (
                <Meter
                  key={id}
                  label={`${getDriver(id).name}: setup confidence`}
                  value={fb ? fb.confidence : 0}
                  effect={fb ? 'Engineers’ estimate from the last run' : 'Unknown until the car runs in practice'}
                />
              );
            })}
            <Meter label="Setup knowledge" value={weekend.prep.setup} effect="How clearly the drivers’ feedback points to the ideal setup" />
            <Meter label="Tyre knowledge" value={weekend.prep.tyres} effect={`${Math.round((1 - prepRace.wear) * 100)}% less tyre wear in races`} />
            <Meter label="Qualifying preparation" value={weekend.prep.quali} effect={`${formatDelta(prepQuali.pace, 2)} on a qualifying lap`} />
          </div>
          <p className="field__help">
            {locked
              ? 'Parc fermé: the setups are locked until the end of the weekend.'
              : `Practice builds these up. Setups lock (parc fermé) when ${circuit.sprint ? 'Sprint Qualifying' : 'qualifying'} begins.`}
            {circuit.sprint ? ' Sprint weekends have only one practice session, so choose carefully.' : ''}
          </p>
        </Panel>
      </div>

      {lastDone && <SessionResult season={season} session={lastDone} />}
    </div>
  );
}

// ---------- Practice and setup ----------

function PracticeView({ season, controller, session }: { season: SeasonState; controller: SeasonController; session: 'fp1' | 'fp2' | 'fp3' }) {
  const [programme, setProgramme] = useState<PracticeProgramme>('setup');
  const weather = season.weekend!.weather[session]!;
  return (
    <>
      <Panel title={`${SESSION_INFO[session].name}: run plan`} icon={<Timer size={16} />}>
        <p className="session-weather">
          <WeatherIcon {...weatherIconProps(weather)} /> {WEATHER_LABEL[weather.scenario]}
          {weather.wetness > 0.35 ? ': a wet track limits useful dry running and setup feedback.' : '.'}
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
      <SetupWorkshop season={season} controller={controller} />
    </>
  );
}

/** Setup sliders for both cars, with each driver's feedback from the last run. */
function SetupWorkshop({ season, controller }: { season: SeasonState; controller: SeasonController }) {
  const weekend = season.weekend!;
  const ids = managedDrivers(season);
  const locked = setupLocked(season);
  return (
    <Panel title="Car setup" icon={<SlidersHorizontal size={16} />} aside={locked ? <span className="tag"><Lock size={12} aria-hidden="true" /> Parc fermé</span> : undefined}>
      <p className="field__help">
        Each driver reports what the car does after every practice run. Move the settings towards their feedback, or let the engineers propose a change. The
        closer to the ideal, the more pace in qualifying and the races (up to about half a second a lap between a poor and a perfect setup).
      </p>
      <div className="setup-cars">
        {ids.map((id) => {
          const setup = weekend.setups[id];
          if (!setup) return null;
          const driver = getDriver(id);
          const proposal = engineerProposal(season, id);
          return (
            <section key={id} className="setup-car" aria-label={`${driver.name} setup`} style={{ '--team': getTeam(driver.teamId).color } as React.CSSProperties}>
              <h3 className="setup-car__title">
                #{driver.number} {driver.name}
                {setup.feedback && <span className="muted"> · confidence {Math.round(setup.feedback.confidence * 100)}%</span>}
              </h3>
              {SETUP_PARAMS.map((param: SetupParam) => {
                const info = SETUP_INFO[param];
                const reading = setup.feedback?.readings[param];
                const inputId = `setup-${id}-${param}`;
                return (
                  <div key={param} className="setup-row">
                    <label className="setup-row__label" htmlFor={inputId}>
                      {info.name}
                      <span className="num">{setup.values[param]}</span>
                    </label>
                    <input
                      id={inputId}
                      className="setup-row__range"
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={setup.values[param]}
                      disabled={locked}
                      aria-label={`${driver.name} ${info.name.toLowerCase()}`}
                      aria-valuetext={`${setup.values[param]} (${info.low} to ${info.high})`}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        controller.update((s) => changeSetup(s, id, { [param]: value }));
                      }}
                    />
                    <span className="setup-row__ends muted" aria-hidden="true">
                      <span>{info.low}</span>
                      <span>{info.high}</span>
                    </span>
                    {reading !== undefined && (
                      <p className={`setup-row__feedback${Math.abs(reading) < 0.12 ? ' is-good' : ''}`}>
                        {feedbackText(param, reading)}
                        {setup.tested && setup.tested[param] !== setup.values[param] && <span className="muted"> (at {setup.tested[param]})</span>}
                      </p>
                    )}
                  </div>
                );
              })}
              <div className="season-actions">
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  disabled={locked || !proposal}
                  onClick={() => proposal && controller.update((s) => changeSetup(s, id, proposal))}
                >
                  <Wand2 size={14} aria-hidden="true" /> {`Apply the engineers’ proposal for ${driver.code}`}
                </button>
                {!setup.feedback && <span className="muted">Run a practice session to get feedback.</span>}
              </div>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}

// ---------- Qualifying ----------

function QualifyingView({ season, controller, session }: { season: SeasonState; controller: SeasonController; session: QualiSessionId }) {
  const q = season.weekend!.qualifying[session];
  const { update } = controller;
  useEffect(() => {
    if (!q) update(ensureQualifying);
  }, [q, update]);
  if (!q) return null;
  // A fresh form for every segment, so the default tyre always suits that segment's track.
  return <QualifyingSegment key={`${session}-${q.segments.length}`} season={season} controller={controller} session={session} q={q} />;
}

function QualifyingSegment({ season, controller, session, q }: { season: SeasonState; controller: SeasonController; session: QualiSessionId; q: QualifyingState }) {
  const index = (q.segments.length + 1) as 1 | 2 | 3;
  const wetness = q.wetness[index - 1] ?? 0;
  const allowed = allowedCompounds(session, index, wetness);
  const suggested = suggestedQualiChoice(session, index, wetness);
  const stillIn = managedInQualifying(season, session);
  const ids = managedDrivers(season);
  const [choices, setChoices] = useState<Record<string, QualiChoice>>(() => Object.fromEntries(stillIn.map((id) => [id, { ...suggested }])));
  const last = q.segments[q.segments.length - 1];
  const fastest = fastestCompoundFor(wetness, allowed);
  const set = (id: string, patch: Partial<QualiChoice>) => setChoices((c) => ({ ...c, [id]: { ...(c[id] ?? suggested), ...patch } }));
  const legal = Object.fromEntries(stillIn.map((id) => [id, { ...choices[id], compound: allowed.includes(choices[id]?.compound) ? choices[id].compound : suggested.compound }]));

  return (
    <Panel title={`${SESSION_INFO[session].name}: ${stillIn.length ? segmentName(session, index) : 'both cars out'}`} icon={<Timer size={16} />}>
      {stillIn.length > 0 ? (
        <>
          <p className="session-weather">
            <WeatherIcon {...weatherIconProps({ scenario: wetness > 0.4 ? 'rainy' : wetness > 0 ? 'variable' : 'dry', wetness })} />{' '}
            {wetness <= 0.02 ? 'Dry track.' : `Track ${Math.round(wetness * 100)}% wet: ${COMPOUNDS[fastest].name} is the quickest tyre.`}{' '}
            {index < 3 ? `The slowest six are knocked out; the top ${QUALI_CUTS[index - 1]} go through.` : 'Top ten shoot-out for pole.'}
          </p>
          {ids
            .filter((id) => !stillIn.includes(id))
            .map((id) => (
              <p key={id} className="muted">
                {getDriver(id).name} is out and starts P{gridSlot(q, id)}.
              </p>
            ))}
          <div className="quali-cars">
            {stillIn.map((id) => {
              const driver = getDriver(id);
              const choice = legal[id];
              return (
                <section key={id} className="quali-car" aria-label={`${driver.name} plan`} style={{ '--team': getTeam(driver.teamId).color } as React.CSSProperties}>
                  <h3 className="setup-car__title">
                    #{driver.number} {driver.name}
                  </h3>
                  <fieldset className="field">
                    <legend className="field__label">
                      Tyre for {driver.code} in {segmentName(session, index)}
                    </legend>
                    <div className="compounds__grid">
                      {allowed.map((compound) => {
                        const delta = compoundPace(compound, wetness) - compoundPace(fastest, wetness);
                        return (
                          <label key={compound} className={`compound${choice.compound === compound ? ' is-checked' : ''}`}>
                            <input type="radio" name={`quali-compound-${id}`} value={compound} checked={choice.compound === compound} onChange={() => set(id, { compound })} />
                            <TyreBadge compound={compound} size={24} />
                            <span className="compound__name">{COMPOUNDS[compound].name}</span>
                            <span className={`compound__delta${delta < 0.05 ? ' is-best' : ''}`}>{delta < 0.05 ? 'Quickest' : formatDelta(delta, 2)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  <Segmented<QualiPlan>
                    legend={`Run plan for ${driver.code}`}
                    layout="grid"
                    value={choice.plan}
                    onChange={(plan) => set(id, { plan })}
                    options={(Object.keys(QUALI_PLANS) as QualiPlan[]).map((p) => ({ value: p, label: QUALI_PLANS[p].name, hint: QUALI_PLANS[p].detail }))}
                  />
                  {session === 'quali' && index < 3 && wetness <= 0.15 && (
                    <p className="field__help">Through on mediums saves a new set of softs for the Grand Prix ({q.savedSoftSets[id] ?? 0}/2 saved).</p>
                  )}
                </section>
              );
            })}
          </div>
          {session === 'sprint-quali' && wetness <= 0.15 && <p className="field__help">Sprint Qualifying rules: mediums in SQ1 and SQ2, softs in SQ3.</p>}
          <div className="season-actions">
            <button type="button" className="btn btn--primary" onClick={() => controller.update((s) => runQualifying(s, legal))}>
              <Play size={16} aria-hidden="true" />
              <span className="btn__label">Run {segmentName(session, index)}</span>
            </button>
          </div>
        </>
      ) : (
        <div className="season-actions">
          <p>
            {ids.map((id) => `${getDriver(id).name} starts P${gridSlot(q, id)}`).join(', ')}. The rest of the session runs without your cars.
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
            playerDriverId={ids}
            caption={`${segmentName(session, last.index)} classification`}
            cutAfter={last.index < 3 ? QUALI_CUTS[last.index - 1] : undefined}
          />
        </div>
      )}
    </Panel>
  );
}

/** Grid slot of a driver knocked out in an earlier segment. */
function gridSlot(q: QualifyingState, id: string): number {
  const seg = q.segments.find((s) => s.eliminated.includes(id));
  if (!seg) return 0;
  return seg.entries.findIndex((e) => e.driverId === id) + 1;
}

// ---------- Sprint and Grand Prix ----------

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
  const grid = useMemo(() => gridFor(season, session) ?? [], [season, session]);
  const ids = managedDrivers(season);
  const weather = weekend.weather[session]!;
  const laps = raceLaps(weekend.circuitId, session);

  // Same pre-race analysis as the quick-race briefing: projected race time for each start tyre and car.
  const estimates = useMemo(() => {
    const out: Record<string, Array<{ compound: CompoundId; total: number; plan: string }>> = Object.fromEntries(ids.map((id) => [id, []]));
    for (const compound of COMPOUND_ORDER) {
      const config = raceConfigFor(season, compound);
      if (!config) continue;
      const race = createRace(config);
      for (const car of getManagedCars(race)) {
        const outlook = evaluateStrategies(race, car.id);
        out[car.driverId]?.push({ compound, total: outlook?.best.totalTime ?? Infinity, plan: outlook ? planLabel(outlook.best.stops) : '' });
      }
    }
    for (const id of ids) out[id].sort((a, b) => a.total - b.total);
    return out;
    // Estimates depend only on the weekend and the car, not on the tyre picks below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season.weekend, season.carStats]);
  const [starts, setStarts] = useState<Record<string, CompoundId>>(() => Object.fromEntries(ids.map((id) => [id, estimates[id]?.[0]?.compound ?? 'medium'])));
  const config = raceConfigFor(season, starts);

  return (
    <Panel title={`${session === 'sprint' ? 'Sprint' : 'Grand Prix'}: ${laps} laps`} icon={<Flag size={16} />}>
      <p className="session-weather">
        <WeatherIcon {...weatherIconProps(weather)} /> {describeScenarioForecast(weather.scenario, circuit)}
      </p>
      <p>
        {ids.map((id, i) => (
          <span key={id}>
            {i > 0 && ' and '}
            <strong>{getDriver(id).name}</strong> starts <strong>P{grid.indexOf(id) + 1}</strong>
          </span>
        ))}{' '}
        of {grid.length}.{' '}
        {session === 'sprint'
          ? 'No compulsory pit stop in the Sprint; points for the top eight (8 to 1).'
          : 'Two dry compounds are compulsory in a dry race; points for the top ten (25 to 1).'}
      </p>
      <div className="quali-cars">
        {ids.map((id) => {
          const driver = getDriver(id);
          const options = estimates[id] ?? [];
          const best = options[0];
          const chosen = options.find((o) => o.compound === starts[id]);
          return (
            <fieldset key={id} className="field">
              <legend className="field__label">Starting tyre for {driver.name}</legend>
              <div className="compounds__grid compounds__grid--start">
                {COMPOUND_ORDER.map((compound) => {
                  const o = options.find((x) => x.compound === compound);
                  const delta = o && best ? o.total - best.total : null;
                  return (
                    <label key={compound} className={`compound${starts[id] === compound ? ' is-checked' : ''}`}>
                      <input
                        type="radio"
                        name={`season-start-${id}`}
                        value={compound}
                        checked={starts[id] === compound}
                        onChange={() => setStarts((s) => ({ ...s, [id]: compound }))}
                      />
                      <TyreBadge compound={compound} size={24} />
                      <span className="compound__name">{COMPOUNDS[compound].name}</span>
                      {delta !== null && Number.isFinite(delta) && (
                        <span className={`compound__delta${delta < 0.05 ? ' is-best' : ''}`}>{delta < 0.05 ? 'Best est.' : formatDelta(delta)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
              {chosen && (
                <p className="field__help">
                  {driver.code} from the {COMPOUNDS[starts[id]].name}: {chosen.plan.toLowerCase()} (an estimate before traffic and Safety Cars).
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
      {resumeLap && <p className="field__help">This race is already under way, so the tyres your cars started on stay.</p>}
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
            <li key={id} className={ids.includes(id) ? 'is-player' : undefined}>
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
  const ids = managedDrivers(season);
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
        <Timesheet entries={result.entries} playerDriverId={ids} caption={`${SESSION_INFO[session].name} classification`} showLaps />
      </Panel>
    );
  }
  if (session === 'quali' || session === 'sprint-quali') {
    const q = weekend.qualifying[session];
    if (!q?.grid) return null;
    return (
      <Panel title={`${SESSION_INFO[session].name} result`}>
        <QualiResultTable q={q} playerDriverIds={ids} />
      </Panel>
    );
  }
  const result = session === 'sprint' ? weekend.sprint : weekend.race;
  if (!result) return null;
  return (
    <Panel title={`${SESSION_INFO[session].name} result${result.simulated ? ' (run by the strategist)' : ''}`}>
      <ResultTable result={result} playerDriverId={ids} caption={`${SESSION_INFO[session].name} classification`} />
    </Panel>
  );
}

export function QualiResultTable({ q, playerDriverIds }: { q: QualifyingState; playerDriverIds: string[] }) {
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
            <tr key={id} className={`${playerDriverIds.includes(id) ? 'is-player' : ''}${i + 1 === 10 || i + 1 === 16 ? ' is-cut' : ''}`}>
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
