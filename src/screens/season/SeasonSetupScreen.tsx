import { useState } from 'react';
import { ArrowLeft, Briefcase, Dices, Plus } from 'lucide-react';
import { Segmented } from '../../components/Segmented';
import { DIFFICULTIES } from '../../game/constants';
import { BASE_DRIVERS, BASE_TEAMS } from '../../game/data/teams';
import { initialStats, overallRating } from '../../game/manager/carStats';
import { CUSTOM_TEAM_ID, DEFAULT_CUSTOM_TEAM, customTeamProblems, type CustomTeamInput } from '../../game/manager/customTeam';
import { financeProfile, formatMoney } from '../../game/manager/finance';
import { randomSeed } from '../../game/rng';
import { boardTarget, isValidSeasonConfig } from '../../game/season/season';
import { TeamDesigner } from './TeamDesigner';
import type { SeasonConfig } from '../../game/season/types';
import type { Difficulty } from '../../game/types';

interface SeasonSetupScreenProps {
  initial: Pick<SeasonConfig, 'teamId' | 'difficulty' | 'customTeam'>;
  hasSeason: boolean;
  onStart: (config: SeasonConfig) => void;
  onBack: () => void;
}

export function SeasonSetupScreen({ initial, hasSeason, onStart, onBack }: SeasonSetupScreenProps) {
  const [config, setConfig] = useState<SeasonConfig>(() => ({ teamId: initial.teamId, difficulty: initial.difficulty, seed: randomSeed() }));
  const [custom, setCustom] = useState<CustomTeamInput>(() => initial.customTeam ?? DEFAULT_CUSTOM_TEAM);
  const ownTeam = config.teamId === CUSTOM_TEAM_ID;
  const final: SeasonConfig = ownTeam ? { ...config, customTeam: custom } : config;
  const problems = ownTeam ? customTeamProblems(custom) : [];
  const seedValid = Number.isInteger(config.seed) && config.seed >= 1 && config.seed <= 999999999;
  const valid = isValidSeasonConfig(final);
  const set = <K extends keyof SeasonConfig>(key: K, value: SeasonConfig[K]) => setConfig((c) => ({ ...c, [key]: value }));

  return (
    <div className="page season-setup">
      <header className="page__head">
        <button type="button" className="btn btn--ghost btn--small" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Menu
        </button>
        <h1 className="page__title display">New career</h1>
      </header>
      <main id="main" tabIndex={-1} className="season-setup__layout">
        <form
          className="briefing__form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onStart(final);
          }}
        >
          <p className="season-setup__lede">
            Take over a 2026 team as Team Principal. You run both cars on the pit wall and the whole operation behind them: car development, the
            factory, the budget and the cost cap, partners and the board. Two pre-season tests in Bahrain, then all 23 rounds with practice, qualifying,
            Sprints and Grands Prix.
          </p>

          <fieldset className="field">
            <legend className="field__label">Your team</legend>
            <div className="team-picker">
              {BASE_TEAMS.map((team) => {
                const drivers = BASE_DRIVERS.filter((d) => d.teamId === team.id);
                const checked = config.teamId === team.id;
                return (
                  <label key={team.id} className={`team-card${checked ? ' is-checked' : ''}`} style={{ '--team': team.color } as React.CSSProperties}>
                    <input type="radio" name="career-team" value={team.id} checked={checked} onChange={() => set('teamId', team.id)} />
                    <span className="team-card__name">{team.name}</span>
                    <span className="team-card__drivers">{drivers.map((d) => d.name).join(' · ')}</span>
                    <span className="team-card__facts">
                      <span>
                        Car <strong className="num">{overallRating(initialStats(team.id))}</strong>
                      </span>
                      <span>
                        Budget <strong className="num">{formatMoney(financeProfile(team.id).balance)}</strong>
                      </span>
                      <span>
                        Target <strong className="num">P{boardTarget(team.carPace, BASE_TEAMS)}</strong>
                      </span>
                    </span>
                  </label>
                );
              })}
              <label className={`team-card team-card--new${ownTeam ? ' is-checked' : ''}`} style={{ '--team': custom.color } as React.CSSProperties}>
                <input type="radio" name="career-team" value={CUSTOM_TEAM_ID} checked={ownTeam} onChange={() => set('teamId', CUSTOM_TEAM_ID)} />
                <span className="team-card__name">
                  <Plus size={16} aria-hidden="true" /> Create a team
                </span>
                <span className="team-card__drivers">Your own name, colours, engine, car concept and drivers</span>
                <span className="team-card__facts">
                  <span>Joins as the 12th team</span>
                </span>
              </label>
            </div>
            <p className="field__help">Car is the overall rating of the 2026 car. Target is the board's expectation in the constructors' championship.</p>
          </fieldset>

          {ownTeam && <TeamDesigner value={custom} onChange={setCustom} problems={problems} />}

          <Segmented<Difficulty>
            legend="Difficulty"
            value={config.difficulty}
            onChange={(difficulty) => set('difficulty', difficulty)}
            options={(['easy', 'normal', 'hard'] as Difficulty[]).map((id) => ({ value: id, label: DIFFICULTIES[id].label }))}
          />
          <p className="field__help">{DIFFICULTIES[config.difficulty].description} Rivals also develop their cars faster on harder levels.</p>

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
                <p className="field__help">The seed decides weather, reliability, rival development and every session. The same seed and choices replay the same season.</p>
              </div>
            </div>
          </details>

          {!seedValid && (
            <p className="form-errors" role="alert">
              The season seed must be a whole number between 1 and 999999999.
            </p>
          )}
          {hasSeason && <p className="field__help">Starting a new career replaces the one you have in progress.</p>}

          <button type="submit" className="btn btn--primary btn--xl" disabled={!valid}>
            <Briefcase size={18} aria-hidden="true" />
            <span className="btn__label">Start the career</span>
          </button>
        </form>
      </main>
    </div>
  );
}
