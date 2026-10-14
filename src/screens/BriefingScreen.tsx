import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Dices, Flag, Play } from 'lucide-react';
import { CircuitMap } from '../components/CircuitMap';
import { Segmented } from '../components/Segmented';
import { TyreBadge } from '../components/TyreBadge';
import { DIFFICULTIES, PIT_STATIONARY_MEAN } from '../game/constants';
import { CIRCUITS, getCircuit, nextRound } from '../game/data/circuits';
import { COMPOUNDS, COMPOUND_ORDER } from '../game/data/tyres';
import { DRIVERS, TEAMS, getDriver, getTeam } from '../game/data/teams';
import { createRace, getPlayerCar, validateConfig } from '../game/engine';
import { formatDelta, formatLapTime } from '../game/format';
import { evaluateStrategies, highlightPlans, planLabel } from '../game/projection';
import { randomSeed } from '../game/rng';
import type { CompoundId, Difficulty, RaceConfig, ScenarioId, WeatherScenario } from '../game/types';
import { describeScenarioForecast } from '../game/weather';

interface BriefingScreenProps {
  config: RaceConfig;
  onChange: (config: RaceConfig) => void;
  onStart: (config: RaceConfig) => void;
  onBack: () => void;
}

const SCENARIOS: Array<{ id: ScenarioId; label: string; detail: string }> = [
  { id: 'none', label: 'Normal race', detail: 'Events happen at random, driven by the seed.' },
  { id: 'safety-car-early', label: 'Early Safety Car drill', detail: 'A Safety Car is deployed after lap 3.' },
  { id: 'safety-car-late', label: 'Late Safety Car drill', detail: 'A Safety Car is deployed four laps from the end.' },
  { id: 'storm', label: 'Incoming storm', detail: 'A dry start, then heavy rain from about a third of the way in.' },
  { id: 'drying', label: 'Drying track', detail: 'A wet start; the track dries over the first half.' },
];

const rating = (value: number, low: number, high: number, labels: [string, string, string]) =>
  value <= low ? labels[0] : value >= high ? labels[2] : labels[1];

const teamRank = (() => {
  const sorted = [...TEAMS].sort((a, b) => a.carPace - b.carPace);
  return (teamId: string) => sorted.findIndex((t) => t.id === teamId) + 1;
})();

export function BriefingScreen({ config, onChange, onStart, onBack }: BriefingScreenProps) {
  const circuit = getCircuit(config.circuitId);
  const upcoming = nextRound();
  const gridRef = useRef<HTMLDivElement>(null);

  // Bring the selected round into view inside the calendar list (without scrolling the page).
  useEffect(() => {
    const grid = gridRef.current;
    const card = grid?.querySelector<HTMLElement>('.circuit-card.is-checked');
    if (!grid || !card) return;
    const top = card.offsetTop - grid.offsetTop;
    if (top < grid.scrollTop || top + card.offsetHeight > grid.scrollTop + grid.clientHeight) grid.scrollTop = top - 8;
    // Only on first render: later selections are made by the player inside the visible list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const driver = getDriver(config.playerDriverId);
  const team = getTeam(driver.teamId);
  const errors = validateConfig(config);
  const set = <K extends keyof RaceConfig>(key: K, value: RaceConfig[K]) => onChange({ ...config, [key]: value });

  // Pre-race analysis: the same projection the pit wall uses during the race.
  const analysis = useMemo(() => {
    if (validateConfig(config).length > 0) return null;
    try {
      const preview = createRace(config);
      const player = getPlayerCar(preview);
      const outlook = evaluateStrategies(preview, player.id);
      const startOptions = COMPOUND_ORDER.map((compound) => {
        const race = compound === config.startCompound ? preview : createRace({ ...config, startCompound: compound });
        const o = evaluateStrategies(race, getPlayerCar(race).id);
        return { compound, total: o?.best.totalTime ?? Infinity, plan: o ? planLabel(o.best.stops) : '' };
      }).sort((a, b) => a.total - b.total);
      return { preview, outlook, startOptions, grid: player.gridPosition };
    } catch {
      return null;
    }
  }, [config]);

  const bestStart = analysis?.startOptions[0];
  const chosenStart = analysis?.startOptions.find((s) => s.compound === config.startCompound);
  const wetStart = (analysis?.preview.weather.wetness ?? 0) >= 0.08;

  return (
    <div className="page briefing">
      <header className="page__head">
        <button type="button" className="btn btn--ghost btn--small" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Menu
        </button>
        <h1 className="page__title display">Race briefing</h1>
      </header>

      <main id="main" tabIndex={-1} className="briefing__layout">
        <form
          className="briefing__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (errors.length === 0) onStart(config);
          }}
          noValidate
        >
          <fieldset className="field">
            <legend className="field__label">Grand Prix: 2026 calendar</legend>
            <div className="circuit-grid" ref={gridRef}>
              {CIRCUITS.map((c) => (
                <label key={c.id} className={`circuit-card${c.id === config.circuitId ? ' is-checked' : ''}`}>
                  <input type="radio" name="circuit" value={c.id} checked={c.id === config.circuitId} onChange={() => onChange({ ...config, circuitId: c.id, laps: c.laps })} />
                  <span className="circuit-card__meta">
                    <span>
                      Round {c.round}
                      {c.sprint && <span className="circuit-card__sprint"> · Sprint</span>}
                    </span>
                    <span>{c.id === upcoming.id ? 'Next race' : c.weekend}</span>
                  </span>
                  <CircuitMap circuit={c} variant="thumb" title={`${c.fullName} layout`} />
                  <span className="circuit-card__name">{c.grandPrix.replace(' Grand Prix', '')}</span>
                  <span className="circuit-card__region muted">{c.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <label className="field__label" htmlFor="driver">
              Your driver
            </label>
            <select id="driver" className="select" value={config.playerDriverId} onChange={(e) => set('playerDriverId', e.target.value)}>
              {TEAMS.map((t) => (
                <optgroup key={t.id} label={t.name}>
                  {DRIVERS.filter((d) => d.teamId === t.id).map((d) => (
                    <option key={d.id} value={d.id}>
                      #{d.number} {d.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="field__help">
              <span className="team-dot" style={{ background: team.color }} aria-hidden="true" /> {team.name}, car rated {teamRank(team.id)} of {TEAMS.length}. Race engineer: {driver.engineer}.
            </p>
          </div>

          <Segmented<WeatherScenario>
            legend="Weather"
            value={config.weather}
            onChange={(weather) => set('weather', weather)}
            options={[
              { value: 'dry', label: 'Dry', hint: 'No rain' },
              { value: 'variable', label: 'Variable', hint: 'Showers possible' },
              { value: 'rainy', label: 'Rainy', hint: 'Wet race' },
            ]}
          />

          <fieldset className="field">
            <legend className="field__label">Starting tyre</legend>
            <div className="compounds__grid compounds__grid--start">
              {COMPOUND_ORDER.map((id) => {
                const option = analysis?.startOptions.find((s) => s.compound === id);
                const delta = option && bestStart ? option.total - bestStart.total : null;
                return (
                  <label key={id} className={`compound${config.startCompound === id ? ' is-checked' : ''}`}>
                    <input type="radio" name="start-compound" value={id} checked={config.startCompound === id} onChange={() => set('startCompound', id as CompoundId)} />
                    <TyreBadge compound={id} size={26} />
                    <span className="compound__name">{COMPOUNDS[id].name}</span>
                    {delta !== null && Number.isFinite(delta) && (
                      <span className={`compound__delta${delta < 0.05 ? ' is-best' : ''}`}>{delta < 0.05 ? 'Best est.' : formatDelta(delta)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Segmented<Difficulty>
            legend="Difficulty"
            value={config.difficulty}
            onChange={(difficulty) => set('difficulty', difficulty)}
            options={(['easy', 'normal', 'hard'] as Difficulty[]).map((id) => ({ value: id, label: DIFFICULTIES[id].label }))}
          />
          <p className="field__help">{DIFFICULTIES[config.difficulty].description} Your own car is never adjusted.</p>

          <details className="advanced">
            <summary>Seed and event drills</summary>
            <div className="advanced__body">
              <div className="field">
                <label className="field__label" htmlFor="seed">
                  Race seed
                </label>
                <div className="seed-row">
                  <input
                    id="seed"
                    className="input num"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    value={String(config.seed)}
                    aria-describedby="seed-help"
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                      set('seed', digits === '' ? 0 : Number(digits));
                    }}
                  />
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => set('seed', randomSeed())}>
                    <Dices size={16} aria-hidden="true" /> New seed
                  </button>
                </div>
                <p className="field__help" id="seed-help">
                  The same seed, settings and decisions always produce the same race.
                </p>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="scenario">
                  Event drill
                </label>
                <select id="scenario" className="select" value={config.scenario ?? 'none'} onChange={(e) => set('scenario', e.target.value as ScenarioId)}>
                  {SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <p className="field__help">{SCENARIOS.find((s) => s.id === (config.scenario ?? 'none'))?.detail}</p>
              </div>
            </div>
          </details>

          {errors.length > 0 && (
            <ul className="form-errors" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <button type="submit" className="btn btn--primary btn--xl briefing__start" disabled={errors.length > 0}>
            <Play size={18} aria-hidden="true" />
            <span className="btn__label">Start race</span>
          </button>
        </form>

        <section className="briefing__intel" aria-labelledby="intel-title">
          <div className="intel__map">
            <CircuitMap circuit={circuit} variant="preview" title={`${circuit.fullName} layout`} />
          </div>
          <h2 id="intel-title" className="intel__title display">
            {circuit.grandPrix}
          </h2>
          <p className="intel__venue muted">
            Round {circuit.round} of {CIRCUITS.length}, {circuit.weekend}. {circuit.fullName}, {circuit.region}
          </p>
          <p className="intel__summary">{circuit.summary}</p>
          <dl className="facts facts--grid">
            <div>
              <dt>Race distance</dt>
              <dd>
                {circuit.laps} laps, {(circuit.laps * circuit.lengthKm).toFixed(1)} km
              </dd>
            </div>
            <div>
              <dt>Lap length</dt>
              <dd>{circuit.lengthKm.toFixed(3)} km</dd>
            </div>
            <div>
              <dt>Reference lap</dt>
              <dd>{formatLapTime(circuit.baseLapTime)}</dd>
            </div>
            <div>
              <dt>Pit stop loss</dt>
              <dd>≈ {(circuit.pitLaneLoss + PIT_STATIONARY_MEAN).toFixed(1)} s</dd>
            </div>
            <div>
              <dt>Tyre wear</dt>
              <dd>{rating(circuit.degradation, 0.85, 1.2, ['Low', 'Medium', 'High'])}</dd>
            </div>
            <div>
              <dt>Overtaking</dt>
              <dd>{rating(circuit.overtakeDelta, 0.5, 0.95, ['Easy', 'Medium', 'Hard'])}</dd>
            </div>
            <div>
              <dt>Safety Car risk</dt>
              <dd>{rating(circuit.safetyCarChance, 0.22, 0.4, ['Low', 'Medium', 'High'])}</dd>
            </div>
          </dl>
          <ul className="traits">
            {circuit.traits.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>

          <h3 className="intel__sub">Forecast</h3>
          <p>
            {config.scenario === 'storm'
              ? 'Event drill: a dry start with heavy rain arriving about a third of the way in.'
              : config.scenario === 'drying'
                ? 'Event drill: a wet start on a track that dries over the first half.'
                : describeScenarioForecast(config.weather, circuit)}
            {wetStart && ' The track is wet at the start.'}
          </p>

          <h3 className="intel__sub">Suggested strategies</h3>
          {analysis?.outlook ? (
            <>
              <ol className="plans">
                {highlightPlans(analysis.outlook, 3, false).map((plan, i) => (
                  <li key={i} className={`plan${i === 0 ? ' is-best' : ''}`}>
                    <span className="plan__rank">{i === 0 ? 'Best est.' : `Option ${String.fromCharCode(65 + i)}`}</span>
                    <span className="plan__stops">
                      <span className="plan__stop">
                        <span className="muted">Start</span> <TyreBadge compound={config.startCompound} size={16} />
                      </span>
                      {plan.stops.map((s) => (
                        <span key={s.lap} className="plan__stop">
                          <span className="muted">L{s.lap}</span> <TyreBadge compound={s.compound} size={16} />
                        </span>
                      ))}
                      {plan.penalty > 0 && <span className="tag tag--danger">+{plan.penalty} s rule</span>}
                    </span>
                    <span className="plan__delta num">{i === 0 ? '' : formatDelta(plan.delta)}</span>
                  </li>
                ))}
              </ol>
              <div className="briefing__note">
                <Flag size={16} aria-hidden="true" />
                <p>
                  {bestStart && chosenStart && bestStart.compound !== config.startCompound
                    ? `Recommended approach: start on ${COMPOUNDS[bestStart.compound].name.toLowerCase()}s (${bestStart.plan.toLowerCase()}). Your choice of ${COMPOUNDS[config.startCompound].name.toLowerCase()}s is estimated ${formatDelta(chosenStart.total - bestStart.total)} slower before traffic, weather and Safety Cars.`
                    : `Recommended approach: your ${COMPOUNDS[config.startCompound].name.toLowerCase()} start looks strongest. ${bestStart?.plan ?? ''}.`}{' '}
                  {driver.name} starts P{analysis.grid} of {analysis.preview.cars.length}. Estimates assume standard pace and no traffic.
                </p>
              </div>
            </>
          ) : (
            <p className="muted">Fix the settings on the left to see suggested strategies.</p>
          )}
        </section>
      </main>
    </div>
  );
}
