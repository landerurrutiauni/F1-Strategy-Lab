import { useState } from 'react';
import { ArrowLeft, Trash2, Volume2 } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Segmented } from '../components/Segmented';
import { TyreBadge } from '../components/TyreBadge';
import { BOOST_COST, COMPOUND_RULE_PENALTY, PACE_MODES } from '../game/constants';
import { CIRCUITS } from '../game/data/circuits';
import { COMPOUNDS, COMPOUND_ORDER } from '../game/data/tyres';
import { formatDelta, formatRaceTime } from '../game/format';
import { clearActiveRace, clearRecords, computeStats, loadRecords } from '../game/persistence';
import { DEFAULT_SETTINGS, saveSettings, type MotionSetting } from '../hooks/settingsStore';
import { useSettings } from '../hooks/useSettings';
import { useSound } from '../hooks/useSound';

function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="page__head">
      <button type="button" className="btn btn--ghost btn--small" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Menu
      </button>
      <h1 className="page__title display">{title}</h1>
    </header>
  );
}

const TYRE_NOTES: Record<string, string> = {
  soft: 'Fastest on a dry track but wears quickly. Best for short stints and the final sprint.',
  medium: 'The all-rounder: a little slower than the soft, noticeably more durable.',
  hard: 'Slowest at first and slow to warm up, but lasts the longest. Good for long stints.',
  inter: 'Shallow tread for a damp or lightly wet track. Overheats and wears fast on a dry one.',
  wet: 'Deep tread for heavy rain and standing water. Very slow once the track dries.',
};

export function HowToPlayScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="page prose-page">
      <PageHeader title="How to play" onBack={onBack} />
      <main id="main" tabIndex={-1} className="prose">
        <section>
          <h2>Your job</h2>
          <p>
            You are the race strategist for one driver on the 2026 grid. You do not steer the car: you choose the pace, the tyres and when to stop.
            The race runs one lap at a time and waits for you, so take as long as you like over each call. A race of 15 laps takes about five to ten minutes.
          </p>
        </section>
        <section>
          <h2>Each lap</h2>
          <ol>
            <li>Read the situation: timing tower, tyre wear, weather radar and the strategy outlook.</li>
            <li>Choose a pace, decide whether to use the overtake boost, and decide whether to box at the end of the lap.</li>
            <li>Press <strong>Advance lap</strong>. The whole field runs the lap and the race feed explains what happened.</li>
          </ol>
          <p>
            A pit call is made <em>before</em> the lap: the car runs the lap, enters the pits at the end of it and starts the next lap on new tyres.
          </p>
        </section>
        <section>
          <h2>Tyres</h2>
          <ul className="tyre-list">
            {COMPOUND_ORDER.map((id) => (
              <li key={id}>
                <TyreBadge compound={id} size={26} />
                <span>
                  <strong>{COMPOUNDS[id].name}.</strong> {TYRE_NOTES[id]}
                </span>
              </li>
            ))}
          </ul>
          <p>
            Wear makes the car slower gradually, then much faster once the tread is nearly gone. Above 85% wear there is a growing risk of a tyre failure, which costs a lot of time and forces a stop.
            In a fully dry race you must use two different dry compounds, or a {COMPOUND_RULE_PENALTY} s penalty is added at the flag.
          </p>
        </section>
        <section>
          <h2>Pit stops</h2>
          <p>
            A stop costs the time spent driving through the pit lane plus the service time, about 20 to 30 s depending on the circuit. You lose places now to go faster later.
            Stopping just before rivals (the undercut) can gain track position, because fresh tyres are quicker straight away.
            Each car has a limited number of new sets of each compound.
          </p>
        </section>
        <section>
          <h2>Weather</h2>
          <p>
            Rain makes the track wet gradually and it dries slowly afterwards. Slicks are quickest on a dry track, intermediates on a damp one and full wets in heavy rain.
            The radar shows the next five laps; the further ahead, the less certain it is. Pitting a lap before the track changes is often the winning move.
          </p>
        </section>
        <section>
          <h2>Safety Car</h2>
          <p>
            After a crash or debris the Safety Car slows the field for a few laps. Nobody can overtake, the gaps close up, and a pit stop costs roughly half the usual time.
            That makes it a great moment to stop, unless you have just pitted.
          </p>
        </section>
        <section>
          <h2>Pace and energy</h2>
          <ul>
            {(['conserve', 'standard', 'push'] as const).map((id) => (
              <li key={id}>
                <strong>{PACE_MODES[id].label}:</strong> {PACE_MODES[id].description} ({formatDelta(PACE_MODES[id].lapDelta, 2)} per lap, wear ×{PACE_MODES[id].wearMultiplier}).
              </li>
            ))}
            <li>
              <strong>Overtake boost:</strong> extra electrical energy for one lap: about 0.3 s quicker and easier passing. It uses {BOOST_COST}% of the energy store, which recharges each lap.
            </li>
          </ul>
        </section>
        <section>
          <h2>Strategy outlook and rating</h2>
          <p>
            The outlook projects every zero-, one- and two-stop plan with the same formulas the race uses and shows the quickest ones. These are estimates: they ignore traffic and future Safety Cars, and the weather may not follow the radar.
            After the flag, your strategy rating judges your calls against the best plan available at the time, so a lucky Safety Car does not inflate it and an unlucky one does not sink it.
          </p>
        </section>
        <section>
          <h2>Keyboard</h2>
          <p>
            On the race screen: <kbd>1</kbd> conserve, <kbd>2</kbd> standard, <kbd>3</kbd> push, <kbd>B</kbd> toggle box, <kbd>E</kbd> toggle boost and <kbd>N</kbd> advance the lap. Every control is also reachable with <kbd>Tab</kbd>.
          </p>
        </section>
      </main>
    </div>
  );
}

export function RecordsScreen({ onBack }: { onBack: () => void }) {
  const [{ races, warning }, setData] = useState(() => loadRecords());
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const stats = computeStats(races);

  return (
    <div className="page records">
      <PageHeader title="Records" onBack={onBack} />
      <main id="main" tabIndex={-1} className="records__layout">
        {warning && (
          <p className="notice" role="status">
            {warning}
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {races.length === 0 ? (
          <section className="panel empty">
            <h2 className="panel__title">No races yet</h2>
            <p>Finish a race and it will be saved here, in this browser.</p>
          </section>
        ) : (
          <>
            <dl className="stat-strip">
              <div>
                <dt>Races</dt>
                <dd className="display">{stats.races}</dd>
              </div>
              <div>
                <dt>Wins</dt>
                <dd className="display">{stats.wins}</dd>
              </div>
              <div>
                <dt>Podiums</dt>
                <dd className="display">{stats.podiums}</dd>
              </div>
              <div>
                <dt>Average finish</dt>
                <dd className="display">{stats.averageFinish !== null ? stats.averageFinish.toFixed(1) : '–'}</dd>
              </div>
              <div>
                <dt>Best rating</dt>
                <dd className="display">{stats.bestScore ?? '–'}</dd>
              </div>
            </dl>

            <section className="panel">
              <h2 className="panel__title">Best result per circuit</h2>
              <ul className="bests">
                {CIRCUITS.map((c) => {
                  const best = stats.bestByCircuit[c.id];
                  return (
                    <li key={c.id}>
                      <span>
                        R{c.round} {c.grandPrix}
                      </span>
                      <span className="num">{best ? `P${best.position}${best.totalTime ? `, ${formatRaceTime(best.totalTime)} (${best.laps} laps)` : ''}` : 'Not raced'}</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="panel">
              <h2 className="panel__title">Race history</h2>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Circuit</th>
                      <th scope="col">Driver</th>
                      <th scope="col">Setup</th>
                      <th scope="col" className="num">Result</th>
                      <th scope="col">Tyres</th>
                      <th scope="col" className="num">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {races.map((r) => (
                      <tr key={r.id}>
                        <td>{new Date(r.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td>{r.circuitName}</td>
                        <td>{r.driverName}</td>
                        <td className="muted">
                          {r.laps} laps, {r.weather}, {r.difficulty}
                        </td>
                        <td className="num">{r.finished ? `P${r.position} from P${r.gridPosition}` : 'DNF'}</td>
                        <td>
                          <span className="plan__stops">
                            {r.stints.map((s, i) => (
                              <span key={i} className="plan__stop">
                                <TyreBadge compound={s.compound} size={16} /> <span className="muted">{s.laps}</span>
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="num">
                          {r.ratingGrade} ({r.ratingScore})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <div>
              <button type="button" className="btn btn--danger btn--small" onClick={() => setConfirm(true)}>
                <Trash2 size={15} aria-hidden="true" /> Clear records
              </button>
            </div>
          </>
        )}
      </main>
      <ConfirmDialog
        open={confirm}
        title="Clear all records?"
        confirmLabel="Clear records"
        tone="danger"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          const result = clearRecords();
          setConfirm(false);
          setData(loadRecords());
          setMessage(result.ok ? 'Records cleared.' : result.error);
        }}
      >
        <p>This deletes every saved race and statistic in this browser. It cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { settings, update, persisted } = useSettings();
  const play = useSound();
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="page settings">
      <PageHeader title="Settings" onBack={onBack} />
      <main id="main" tabIndex={-1} className="settings__layout">
        {!persisted && (
          <p className="notice" role="status">
            Settings apply now but could not be saved in this browser.
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        <section className="panel">
          <Segmented<MotionSetting>
            legend="Motion"
            value={settings.motion}
            onChange={(motion) => update({ motion })}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'reduced', label: 'Reduced' },
              { value: 'full', label: 'Full' },
            ]}
          />
          <p className="field__help">Reduced motion turns off car, timing-tower and menu animations. The race itself is unaffected.</p>
        </section>
        <section className="panel">
          <label className={`switch${settings.sound ? ' is-on' : ''}`}>
            <input type="checkbox" role="switch" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
            <span className="switch__text">
              <span className="switch__label">Sound effects</span>
              <span className="switch__hint">Short synthesised beeps for laps, pit stops, Safety Cars and the flag. Off by default.</span>
            </span>
          </label>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => play('pit', true)}>
            <Volume2 size={15} aria-hidden="true" /> Test sound
          </button>
        </section>
        <section className="panel">
          <label className={`switch${settings.showProjections ? ' is-on' : ''}`}>
            <input type="checkbox" role="switch" checked={settings.showProjections} onChange={(e) => update({ showProjections: e.target.checked })} />
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
            <span className="switch__text">
              <span className="switch__label">Show strategy projections</span>
              <span className="switch__hint">Turn off to race on instinct: hides estimated plan times, pit deltas and compound estimates.</span>
            </span>
          </label>
          <label className={`switch${settings.confirmLeave ? ' is-on' : ''}`}>
            <input type="checkbox" role="switch" checked={settings.confirmLeave} onChange={(e) => update({ confirmLeave: e.target.checked })} />
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
            <span className="switch__text">
              <span className="switch__label">Confirm before leaving a race</span>
            </span>
          </label>
          <Segmented<'interval' | 'leader'>
            legend="Timing tower gaps"
            value={settings.gapMode}
            onChange={(gapMode) => update({ gapMode })}
            options={[
              { value: 'interval', label: 'To car ahead' },
              { value: 'leader', label: 'To leader' },
            ]}
          />
        </section>
        <section className="panel">
          <h2 className="panel__title">Saved data</h2>
          <p className="field__help">Records, settings and the race in progress are stored only in this browser.</p>
          <button type="button" className="btn btn--danger btn--small" onClick={() => setConfirmReset(true)}>
            <Trash2 size={15} aria-hidden="true" /> Reset all data
          </button>
        </section>
      </main>
      <ConfirmDialog
        open={confirmReset}
        title="Reset all data?"
        confirmLabel="Reset everything"
        tone="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          const records = clearRecords();
          clearActiveRace();
          update(DEFAULT_SETTINGS);
          const ok = saveSettings(DEFAULT_SETTINGS);
          setConfirmReset(false);
          setMessage(records.ok && ok ? 'All data reset.' : 'Some data could not be reset in this browser.');
        }}
      >
        <p>This deletes your records, the race in progress and your settings.</p>
      </ConfirmDialog>
    </div>
  );
}

export function AboutScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="page prose-page">
      <PageHeader title="About" onBack={onBack} />
      <main id="main" tabIndex={-1} className="prose">
        <section>
          <h2>An unofficial fan game</h2>
          <p>
            F1 Strategy Lab is an independent, educational fan project. It is not affiliated with, endorsed by or connected to Formula 1, the FIA, Formula One
            Management or any team, driver or engineer. Team, driver, engineer and circuit names are used only to identify who and where is being simulated. No
            official logos or assets are used, and team colours are approximations.
          </p>
        </section>
        <section>
          <h2>What is real and what is not</h2>
          <ul>
            <li>The 2026 teams, drivers, car numbers and race engineers follow public reporting at the time of writing.</li>
            <li>Circuit layouts are drawn from real track geometry (see credits).</li>
            <li>
              Lap times, pit losses, tyre behaviour, car and driver ratings and strategy styles are simplified, illustrative game values. They are not real telemetry
              and say nothing about how real teams or people perform or operate.
            </li>
            <li>Every race result, radio message, mistake and incident in the game is fictional and generated by the simulation.</li>
          </ul>
        </section>
        <section>
          <h2>Credits</h2>
          <ul>
            <li>
              Circuit layouts: <a href="https://github.com/bacinger/f1-circuits">bacinger/f1-circuits</a>, © 2019–2025 Tomislav Bacinger, MIT licence.
            </li>
            <li>Typefaces: Saira and Archivo (SIL Open Font License), bundled with the game.</li>
            <li>Icons: Lucide (ISC licence).</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
