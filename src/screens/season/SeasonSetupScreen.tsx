import { useState } from 'react';
import { ArrowLeft, Dices, Trophy } from 'lucide-react';
import { Segmented } from '../../components/Segmented';
import { DIFFICULTIES } from '../../game/constants';
import { DRIVERS, TEAMS, getDriver, getTeam } from '../../game/data/teams';
import { randomSeed } from '../../game/rng';
import { isValidSeasonConfig } from '../../game/season/season';
import type { SeasonConfig } from '../../game/season/types';
import type { Difficulty } from '../../game/types';

interface SeasonSetupScreenProps {
  initial: Pick<SeasonConfig, 'playerDriverId' | 'difficulty'>;
  hasSeason: boolean;
  onStart: (config: SeasonConfig) => void;
  onBack: () => void;
}

export function SeasonSetupScreen({ initial, hasSeason, onStart, onBack }: SeasonSetupScreenProps) {
  const [config, setConfig] = useState<SeasonConfig>(() => ({ ...initial, seed: randomSeed() }));
  const driver = getDriver(config.playerDriverId);
  const team = getTeam(driver.teamId);
  const valid = isValidSeasonConfig(config);
  const set = <K extends keyof SeasonConfig>(key: K, value: SeasonConfig[K]) => setConfig((c) => ({ ...c, [key]: value }));

  return (
    <div className="page season-setup">
      <header className="page__head">
        <button type="button" className="btn btn--ghost btn--small" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Menu
        </button>
        <h1 className="page__title display">New season</h1>
      </header>
      <main id="main" tabIndex={-1} className="season-setup__layout">
        <form
          className="briefing__form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onStart(config);
          }}
        >
          <p className="season-setup__lede">
            Run the pit wall for a whole year: two pre-season tests in Bahrain, then all 23 rounds of the 2026 calendar with practice, qualifying and the
            Grand Prix, plus Sprint Qualifying and a Sprint at the six Sprint weekends. Every result counts towards both championships.
          </p>

          <div className="field">
            <label className="field__label" htmlFor="season-driver">
              Your driver
            </label>
            <select id="season-driver" className="select" value={config.playerDriverId} onChange={(e) => set('playerDriverId', e.target.value)}>
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
              <span className="team-dot" style={{ background: team.color }} aria-hidden="true" /> {team.name}. Race engineer: {driver.engineer}.
            </p>
          </div>

          <Segmented<Difficulty>
            legend="Difficulty"
            value={config.difficulty}
            onChange={(difficulty) => set('difficulty', difficulty)}
            options={(['easy', 'normal', 'hard'] as Difficulty[]).map((id) => ({ value: id, label: DIFFICULTIES[id].label }))}
          />
          <p className="field__help">{DIFFICULTIES[config.difficulty].description}</p>

          <details className="advanced">
            <summary>Season seed</summary>
            <div className="advanced__body">
              <div className="field">
                <label className="field__label" htmlFor="season-seed">
                  Season seed
                </label>
                <div className="seed-row">
                  <input
                    id="season-seed"
                    className="input num"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    value={String(config.seed)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                      set('seed', digits === '' ? 0 : Number(digits));
                    }}
                  />
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => set('seed', randomSeed())}>
                    <Dices size={16} aria-hidden="true" /> New seed
                  </button>
                </div>
                <p className="field__help">The seed decides weather, reliability and every session. The same seed and choices replay the same season.</p>
              </div>
            </div>
          </details>

          {!valid && (
            <p className="form-errors" role="alert">
              The season seed must be a whole number between 1 and 999999999.
            </p>
          )}
          {hasSeason && <p className="field__help">Starting a new season replaces the one you have in progress.</p>}

          <button type="submit" className="btn btn--primary btn--xl" disabled={!valid}>
            <Trophy size={18} aria-hidden="true" />
            <span className="btn__label">Start the season</span>
          </button>
        </form>
      </main>
    </div>
  );
}
