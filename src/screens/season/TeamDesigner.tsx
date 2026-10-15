import { useId } from 'react';
import { Segmented } from '../../components/Segmented';
import { BASE_TEAMS } from '../../game/data/teams';
import { overallRating, statsFromPace } from '../../game/manager/carStats';
import {
  CAR_CONCEPTS,
  DRIVER_EXPERIENCE,
  LIVERY_COLORS,
  POWER_UNITS,
  TEAM_LEVELS,
  customCharacter,
  suggestCode,
  type CarConcept,
  type CustomDriverInput,
  type CustomTeamInput,
  type DriverExperience,
  type PowerUnit,
  type TeamLevel,
} from '../../game/manager/customTeam';
import { formatMoney } from '../../game/manager/finance';
import { boardTarget } from '../../game/season/season';

interface TeamDesignerProps {
  value: CustomTeamInput;
  onChange: (value: CustomTeamInput) => void;
  problems: string[];
}

const letters = (text: string) =>
  text
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);

/** Form to create your own team: identity, car, starting level and two drivers. */
export function TeamDesigner({ value, onChange, problems }: TeamDesignerProps) {
  const id = useId();
  const set = <K extends keyof CustomTeamInput>(key: K, v: CustomTeamInput[K]) => onChange({ ...value, [key]: v });
  const setDriver = (index: 0 | 1, patch: Partial<CustomDriverInput>) => {
    const drivers = [...value.drivers] as CustomTeamInput['drivers'];
    drivers[index] = { ...drivers[index], ...patch };
    onChange({ ...value, drivers });
  };
  const level = TEAM_LEVELS[value.level];
  const rating = overallRating(statsFromPace(level.carPace, customCharacter(value)));
  const target = boardTarget(level.carPace, [...BASE_TEAMS, { carPace: level.carPace }]);
  const customColor = !LIVERY_COLORS.includes(value.color.toLowerCase());

  return (
    <section className="designer" aria-labelledby={`${id}-title`} style={{ '--team': value.color } as React.CSSProperties}>
      <h2 id={`${id}-title`} className="designer__title">
        Create your team
      </h2>
      <p className="field__help">Your team joins the 2026 grid as the twelfth entry, so 24 cars race and seven drop out in each of Q1 and Q2.</p>

      <div className="designer__row">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-name`}>
            Team name
          </label>
          <input
            id={`${id}-name`}
            className="input"
            type="text"
            maxLength={28}
            autoComplete="off"
            value={value.name}
            onChange={(e) => {
              const name = e.target.value;
              // Keep the short name in step with the name until the player edits it.
              const short = value.short === letters(value.name) ? letters(name) : value.short;
              onChange({ ...value, name, short });
            }}
          />
        </div>
        <div className="field field--short">
          <label className="field__label" htmlFor={`${id}-short`}>
            Short name
          </label>
          <input
            id={`${id}-short`}
            className="input num"
            type="text"
            maxLength={3}
            autoComplete="off"
            spellCheck={false}
            value={value.short}
            onChange={(e) => set('short', letters(e.target.value))}
          />
        </div>
      </div>

      <fieldset className="field">
        <legend className="field__label">Livery colour</legend>
        <div className="swatches">
          {LIVERY_COLORS.map((color) => (
            <label key={color} className={`swatch-pick${value.color.toLowerCase() === color ? ' is-checked' : ''}`} style={{ background: color }}>
              <input type="radio" name={`${id}-color`} value={color} checked={value.color.toLowerCase() === color} onChange={() => set('color', color)} aria-label={`Colour ${color}`} />
            </label>
          ))}
          <label className={`swatch-pick swatch-pick--custom${customColor ? ' is-checked' : ''}`}>
            <span className="visually-hidden">Custom colour</span>
            <input type="color" value={value.color} onChange={(e) => set('color', e.target.value)} />
          </label>
        </div>
      </fieldset>

      <div className="field">
        <label className="field__label" htmlFor={`${id}-pu`}>
          Power unit
        </label>
        <select id={`${id}-pu`} className="select" value={value.powerUnit} onChange={(e) => set('powerUnit', e.target.value as PowerUnit)}>
          {(Object.keys(POWER_UNITS) as PowerUnit[]).map((pu) => (
            <option key={pu} value={pu}>
              {POWER_UNITS[pu].name}
            </option>
          ))}
        </select>
        <p className="field__help">Customer engine supply. Engines differ a little in straight-line speed and reliability (illustrative values).</p>
      </div>

      <Segmented<CarConcept>
        legend="Car concept"
        layout="grid"
        value={value.concept}
        onChange={(concept) => set('concept', concept)}
        options={(Object.keys(CAR_CONCEPTS) as CarConcept[]).map((c) => ({ value: c, label: CAR_CONCEPTS[c].name, hint: CAR_CONCEPTS[c].detail }))}
      />

      <Segmented<TeamLevel>
        legend="Starting level"
        layout="grid"
        value={value.level}
        onChange={(lvl) => set('level', lvl)}
        options={(Object.keys(TEAM_LEVELS) as TeamLevel[]).map((l) => ({ value: l, label: TEAM_LEVELS[l].name, hint: TEAM_LEVELS[l].detail }))}
      />

      <div className="designer__drivers">
        {([0, 1] as const).map((i) => {
          const d = value.drivers[i];
          const base = `${id}-d${i}`;
          return (
            <fieldset key={i} className="designer__driver">
              <legend className="field__label">Driver {i + 1}</legend>
              <div className="field">
                <label className="field__label" htmlFor={`${base}-name`}>
                  Name
                </label>
                <input
                  id={`${base}-name`}
                  className="input"
                  type="text"
                  maxLength={32}
                  autoComplete="off"
                  value={d.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    // Keep the timing code in step with the surname until the player edits it.
                    const code = d.code === suggestCode(d.name) ? suggestCode(name) : d.code;
                    setDriver(i, { name, code });
                  }}
                />
              </div>
              <div className="designer__row">
                <div className="field">
                  <label className="field__label" htmlFor={`${base}-number`}>
                    Car number
                  </label>
                  <input
                    id={`${base}-number`}
                    className="input num"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={d.number ? String(d.number) : ''}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                      setDriver(i, { number: digits === '' ? 0 : Number(digits) });
                    }}
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={`${base}-code`}>
                    Timing code
                  </label>
                  <input
                    id={`${base}-code`}
                    className="input num"
                    type="text"
                    maxLength={3}
                    autoComplete="off"
                    spellCheck={false}
                    value={d.code}
                    onChange={(e) => setDriver(i, { code: letters(e.target.value) })}
                  />
                </div>
              </div>
              <div className="field">
                <label className="field__label" htmlFor={`${base}-engineer`}>
                  Race engineer
                </label>
                <input
                  id={`${base}-engineer`}
                  className="input"
                  type="text"
                  maxLength={32}
                  autoComplete="off"
                  value={d.engineer}
                  onChange={(e) => setDriver(i, { engineer: e.target.value })}
                />
              </div>
              <Segmented<DriverExperience>
                legend={`Driver ${i + 1} experience`}
                value={d.experience}
                onChange={(experience) => setDriver(i, { experience })}
                options={(Object.keys(DRIVER_EXPERIENCE) as DriverExperience[]).map((x) => ({ value: x, label: DRIVER_EXPERIENCE[x].name, hint: DRIVER_EXPERIENCE[x].detail }))}
              />
            </fieldset>
          );
        })}
      </div>

      <dl className="designer__summary">
        <div>
          <dt>Car rating</dt>
          <dd className="num">{rating}</dd>
        </div>
        <div>
          <dt>Budget</dt>
          <dd className="num">{formatMoney(level.balance)}</dd>
        </div>
        <div>
          <dt>Facilities</dt>
          <dd className="num">Level {level.facilities}</dd>
        </div>
        <div>
          <dt>Board target</dt>
          <dd className="num">P{target}</dd>
        </div>
      </dl>

      {problems.length > 0 && (
        <ul className="form-errors" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
