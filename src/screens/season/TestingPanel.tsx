import { useState } from 'react';
import { FlaskConical, Play, Plane } from 'lucide-react';
import { CircuitMap } from '../../components/CircuitMap';
import { Panel } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Meter, Timesheet } from '../../components/season/SeasonTables';
import { CIRCUITS, TESTING_CIRCUIT } from '../../game/data/circuits';
import { getDriver } from '../../game/data/teams';
import { formatDelta } from '../../game/format';
import { TEST_DAYS, finishTesting, nextTestDay, runTesting } from '../../game/season/season';
import { TEST_PROGRAMMES, developmentEffects } from '../../game/season/sessions';
import type { SeasonState, TestProgramme } from '../../game/season/types';
import type { SeasonController } from '../../hooks/useSeason';

export function TestingPanel({ season, controller }: { season: SeasonState; controller: SeasonController }) {
  const [programme, setProgramme] = useState<TestProgramme>('aero');
  const slot = nextTestDay(season);
  const dev = season.testing.development;
  const fx = developmentEffects(dev);
  const lastDay = season.testing.days[season.testing.days.length - 1];
  const driver = getDriver(season.config.playerDriverId);

  return (
    <div className="season-main">
      <section className="panel weekend-head" aria-labelledby="testing-title">
        <div className="weekend-head__map">
          <CircuitMap circuit={TESTING_CIRCUIT} variant="thumb" title={`${TESTING_CIRCUIT.fullName} layout`} />
        </div>
        <div>
          <p className="weekend-head__kicker">Pre-season · {TESTING_CIRCUIT.weekend}</p>
          <h2 id="testing-title" className="weekend-head__title display">
            Pre-season testing
          </h2>
          <p className="muted">
            {TESTING_CIRCUIT.fullName}, {TESTING_CIRCUIT.region}. Two three-day tests are all the running before Melbourne. Choose what the team works on each day:
            every programme improves one part of the car for the whole season.
          </p>
        </div>
      </section>

      <ol className="session-track" aria-label="Test days">
        {TEST_DAYS.map((d, i) => {
          const done = i < season.testing.days.length;
          const current = slot && slot.test === d.test && slot.day === d.day;
          return (
            <li key={i} className={`session-chip${done ? ' is-done' : ''}${current ? ' is-current' : ''}`} aria-current={current ? 'step' : undefined}>
              <span className="session-chip__name">
                Test {d.test} · Day {d.day}
              </span>
              <span className="session-chip__day">{done ? TEST_PROGRAMMES[season.testing.days[i].programme].name : d.date}</span>
            </li>
          );
        })}
      </ol>

      <div className="season-split">
        <Panel title={slot ? `Plan for test ${slot.test}, day ${slot.day} (${slot.date})` : 'Testing complete'} icon={<Play size={16} />}>
          {slot ? (
            <>
              <Segmented<TestProgramme>
                legend="Programme"
                hideLegend
                layout="grid"
                value={programme}
                onChange={setProgramme}
                options={(Object.keys(TEST_PROGRAMMES) as TestProgramme[]).map((id) => ({ value: id, label: TEST_PROGRAMMES[id].name, hint: TEST_PROGRAMMES[id].detail }))}
              />
              <div className="season-actions">
                <button type="button" className="btn btn--primary" onClick={() => controller.update((s) => runTesting(s, programme))}>
                  <Play size={16} aria-hidden="true" />
                  <span className="btn__label">Run day {season.testing.days.length + 1}</span>
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => controller.update(finishTesting)}>
                  Skip the rest of testing
                </button>
              </div>
            </>
          ) : (
            <div className="season-actions">
              <p>
                {driver.name} and the team head to {CIRCUITS[0].region.split(',')[0]} for round 1, the {CIRCUITS[0].grandPrix}.
              </p>
              <button type="button" className="btn btn--primary" onClick={() => controller.update(finishTesting)}>
                <Plane size={16} aria-hidden="true" />
                <span className="btn__label">Go to round 1</span>
              </button>
            </div>
          )}
        </Panel>
        <Panel title="Development" icon={<FlaskConical size={16} />}>
          <div className="meters">
            <Meter label="Car pace" value={dev.pace} effect={dev.pace > 0 ? `${formatDelta(fx.pace, 2)} per lap` : 'No gain yet'} />
            <Meter label="Tyre management" value={dev.tyres} effect={dev.tyres > 0 ? `${Math.round((1 - fx.wear) * 100)}% less tyre wear` : 'No gain yet'} />
            <Meter label="Pit crew" value={dev.pitCrew} effect={dev.pitCrew > 0 ? `${fx.pit.toFixed(2)} s quicker stops` : 'No gain yet'} />
            <Meter label="Reliability" value={dev.reliability} effect={dev.reliability > 0.5 ? 'Fewer mechanical failures' : 'Untested parts can fail in races'} />
          </div>
          <p className="field__help">Each day closes about a third of the remaining gap in its area, so spreading the work pays off.</p>
        </Panel>

      </div>

      {lastDay && (
        <Panel title={`Timesheet: test ${lastDay.test}, day ${lastDay.day}`}>
          <ul className="notes">
            {lastDay.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <Timesheet entries={lastDay.entries} playerDriverId={season.config.playerDriverId} caption={`Test ${lastDay.test} day ${lastDay.day} timesheet`} showLaps />
        </Panel>
      )}
    </div>
  );
}
