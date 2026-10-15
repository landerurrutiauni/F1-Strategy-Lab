import { useEffect, useState } from 'react';
import { Banknote, Building2, Hammer, Inbox, Mail, MailOpen, Wrench } from 'lucide-react';
import { Panel } from '../../components/Panel';
import { getCircuit } from '../../game/data/circuits';
import { TEAMS, getTeam } from '../../game/data/teams';
import { CAR_STATS, STAT_LABEL, circuitWeights, overallRating, type CarStat } from '../../game/manager/carStats';
import {
  FACILITIES,
  FACILITY_IDS,
  MAX_FACILITY_LEVEL,
  PARTS,
  PART_IDS,
  daysBetween,
  designDays,
  expectedPoints,
  facilityUpgrade,
  maxProjects,
  pitCrewBonus,
  type FacilityId,
} from '../../game/manager/development';
import { COST_CAP, OBJECTIVE_LABEL, formatMoney } from '../../game/manager/finance';
import {
  capHeadroom,
  facilityBlocker,
  formatDate,
  markRead,
  projectBlocker,
  simulatorKnowledge,
  startProject,
  upgradeFacility,
} from '../../game/season/season';
import type { SeasonState } from '../../game/season/types';
import type { SeasonController } from '../../hooks/useSeason';

interface HqProps {
  season: SeasonState;
  controller: SeasonController;
}

const signed = (n: number, digits = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;

/** The circuit of the next (or current) weekend, for "what the next track rewards". */
function nextCircuit(season: SeasonState) {
  if (season.phase === 'finished') return null;
  return getCircuit(season.weekend?.circuitId ?? 'albert-park');
}

// ---------- Car development ----------

export function CarPanel({ season, controller }: HqProps) {
  const teamId = season.config.teamId;
  const mine = season.carStats[teamId];
  const rivals = TEAMS.filter((t) => t.id !== teamId);
  const circuit = nextCircuit(season);
  const weights = circuit ? circuitWeights(circuit) : null;
  const headroom = capHeadroom(season);
  const best = (stat: CarStat) => rivals.reduce((top, t) => (season.carStats[t.id][stat] > season.carStats[top.id][stat] ? t : top), rivals[0]);
  const average = (stat: CarStat) => TEAMS.reduce((sum, t) => sum + season.carStats[t.id][stat], 0) / TEAMS.length;
  const ranking = [...TEAMS].sort((a, b) => overallRating(season.carStats[b.id]) - overallRating(season.carStats[a.id]));

  return (
    <div className="season-main">
      <div className="season-split">
        <Panel title="Car ratings" icon={<Wrench size={16} />}>
          <div className="table-scroll">
            <table className="table table--compact ratings">
              <caption className="visually-hidden">Your car's ratings against the field</caption>
              <thead>
                <tr>
                  <th scope="col">Area</th>
                  <th scope="col">Your car</th>
                  <th scope="col" className="num">
                    Best rival
                  </th>
                  <th scope="col" className="num">
                    Grid avg.
                  </th>
                </tr>
              </thead>
              <tbody>
                {CAR_STATS.map((stat) => {
                  const top = best(stat);
                  const weight = stat === 'tyreCare' ? null : weights?.[stat];
                  return (
                    <tr key={stat}>
                      <th scope="row">
                        {STAT_LABEL[stat]}
                        {weight !== null && weight !== undefined && weight >= 0.35 && <span className="tag tag--key">Key at {circuit!.name}</span>}
                      </th>
                      <td>
                        <span className="rating-bar">
                          <span className="rating-bar__track" aria-hidden="true">
                            <span className="rating-bar__fill" style={{ width: `${mine[stat]}%`, background: getTeam(teamId).color }} />
                          </span>
                          <strong className="num">{mine[stat].toFixed(1)}</strong>
                        </span>
                      </td>
                      <td className="num">
                        {season.carStats[top.id][stat].toFixed(1)} <span className="muted">{top.short}</span>
                      </td>
                      <td className="num">{average(stat).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="field__help">
            Every circuit weights the ratings differently: slow corners rule Monaco, straight-line speed rules Monza. Tyre care lowers tyre wear in races.
            {circuit && ` Next up: ${circuit.grandPrix}.`}
          </p>
        </Panel>

        <Panel title="Pecking order" icon={<Hammer size={16} />}>
          <ol className="pecking">
            {ranking.map((t) => (
              <li key={t.id} className={t.id === teamId ? 'is-player' : undefined}>
                <span className="team-dot" style={{ background: t.color }} aria-hidden="true" />
                <span className="pecking__name">{t.name}</span>
                <span className="num">{overallRating(season.carStats[t.id])}</span>
              </li>
            ))}
          </ol>
          <p className="field__help">Overall rating of every car. Rivals bring upgrades between rounds; standing still means falling back.</p>
        </Panel>
      </div>

      <Panel title="Design office" icon={<Hammer size={16} />}>
        <p className="hq-facts">
          <span>
            Projects <strong className="num">{season.projects.length}/{maxProjects(season.facilities)}</strong>
          </span>
          <span>
            Bank <strong className="num">{formatMoney(season.finance.balance)}</strong>
          </span>
          <span>
            Cost-cap room for development <strong className="num">{formatMoney(Math.max(0, headroom))}</strong>
          </span>
          <span>
            Today <strong>{formatDate(season.date)}</strong>
          </span>
        </p>

        {season.projects.length > 0 && (
          <ul className="projects">
            {season.projects.map((p) => {
              const total = Math.max(1, daysBetween(p.started, p.ready));
              const done = Math.min(1, Math.max(0, daysBetween(p.started, season.date) / total));
              return (
                <li key={p.id} className="project">
                  <span className="project__name">{PARTS[p.part].name}</span>
                  <span className="project__track" aria-hidden="true">
                    <span className="project__fill" style={{ width: `${Math.round(done * 100)}%` }} />
                  </span>
                  <span className="muted">Ready {formatDate(p.ready)}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="part-grid">
          {PART_IDS.map((part) => {
            const spec = PARTS[part];
            const blocker = projectBlocker(season, part);
            const points = expectedPoints(part, season.facilities);
            const areas = (Object.entries(spec.weights) as Array<[CarStat, number]>).map(([stat, w]) => `${STAT_LABEL[stat]} ${signed(points * w)}`);
            return (
              <article key={part} className="part-card">
                <h3 className="part-card__name">{spec.name}</h3>
                <p className="part-card__detail muted">{spec.detail}</p>
                <p className="part-card__gain">
                  <span className="muted">Expected: </span>
                  {areas.join(' · ')}
                </p>
                <p className="part-card__meta">
                  <span className="num">{formatMoney(spec.cost)}</span> · <span className="num">{designDays(part, season.facilities)} days</span>
                </p>
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  disabled={!!blocker}
                  aria-label={`Design a new ${spec.name.toLowerCase()}`}
                  onClick={() => controller.update((s) => startProject(s, part))}
                >
                  Start design
                </button>
                {blocker && <p className="part-card__blocker">{blocker}</p>}
              </article>
            );
          })}
        </div>
        <p className="field__help">
          Gains are estimates: a part can beat the wind tunnel or fail to correlate. The better a rating already is, the smaller the gain. Parts count
          towards the {formatMoney(COST_CAP)} cost cap, and the operating costs of the remaining weekends are set aside first.
        </p>
      </Panel>

      {season.upgrades.length > 0 && (
        <Panel title="Upgrades fitted">
          <div className="table-scroll">
            <table className="table table--compact">
              <caption className="visually-hidden">Upgrades fitted this season</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Part</th>
                  <th scope="col">Gains</th>
                </tr>
              </thead>
              <tbody>
                {[...season.upgrades].reverse().map((u, i) => (
                  <tr key={`${u.part}-${u.date}-${i}`}>
                    <td>{formatDate(u.date)}</td>
                    <td>{PARTS[u.part].name}</td>
                    <td>
                      {(Object.entries(u.gains) as Array<[CarStat, number]>).map(([stat, g]) => `${STAT_LABEL[stat]} ${signed(g)}`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ---------- Facilities ----------

function facilityEffect(season: SeasonState, id: FacilityId, level: number): string {
  const f = { ...season.facilities, [id]: { level } };
  switch (id) {
    case 'windTunnel':
    case 'cfd':
      return `Upgrades at ${Math.round((expectedPoints('floor', f) / PARTS.floor.points) * 100)}% of nominal${id === 'cfd' ? `, a floor in ${designDays('floor', f)} days` : ''}`;
    case 'simulator':
      return `Setup knowledge starts at ${Math.round(simulatorKnowledge(level) * 100)}% each weekend`;
    case 'factory':
      return `${maxProjects(f)} projects at once, a floor in ${designDays('floor', f)} days`;
    case 'pitCrew': {
      const bonus = pitCrewBonus(f);
      return bonus === 0 ? 'Average stationary times' : `${Math.abs(bonus).toFixed(2)} s ${bonus > 0 ? 'quicker' : 'slower'} than average stops`;
    }
  }
}

export function FacilitiesPanel({ season, controller }: HqProps) {
  return (
    <Panel title="Factory and facilities" icon={<Building2 size={16} />}>
      <p className="hq-facts">
        <span>
          Bank <strong className="num">{formatMoney(season.finance.balance)}</strong>
        </span>
        <span className="muted">Facility work is capital spending: it does not count towards the cost cap.</span>
      </p>
      <div className="facility-grid">
        {FACILITY_IDS.map((id) => {
          const spec = FACILITIES[id];
          const f = season.facilities[id];
          const blocker = facilityBlocker(season, id);
          const next = f.level < MAX_FACILITY_LEVEL ? facilityUpgrade(f.level) : null;
          return (
            <article key={id} className="facility">
              <h3 className="facility__name">{spec.name}</h3>
              <p className="facility__level" aria-label={`Level ${f.level} of ${MAX_FACILITY_LEVEL}`}>
                {Array.from({ length: MAX_FACILITY_LEVEL }, (_, i) => (
                  <span key={i} className={`pip${i < f.level ? ' is-on' : ''}`} aria-hidden="true" />
                ))}
                <span className="num">Level {f.level}</span>
              </p>
              <p className="muted">{spec.detail}</p>
              <p className="facility__effect">{facilityEffect(season, id, f.level)}</p>
              {next && !f.upgradeReady && <p className="facility__next muted">Level {f.level + 1}: {facilityEffect(season, id, f.level + 1)}</p>}
              {next && (
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  disabled={!!blocker}
                  aria-label={`Upgrade the ${spec.name.toLowerCase()}`}
                  onClick={() => controller.update((s) => upgradeFacility(s, id))}
                >
                  Upgrade · {formatMoney(next.cost)} · {next.days} days
                </button>
              )}
              {blocker && <p className="part-card__blocker">{blocker}</p>}
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

// ---------- Finances ----------

export function FinancePanel({ season }: { season: SeasonState }) {
  const { finance } = season;
  const headroom = capHeadroom(season);
  const committed = Math.max(0, COST_CAP - finance.capSpent - headroom);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / COST_CAP) * 100))}%`;
  return (
    <div className="season-main">
      <div className="season-split season-split--even">
        <Panel title="Budget" icon={<Banknote size={16} />}>
          <p className="hq-big num">{formatMoney(finance.balance)}</p>
          <p className="muted">In the bank. Partners and the prize fund pay after every Grand Prix; operations and salaries are paid then too.</p>
          <h3 className="hq-sub">Cost cap {formatMoney(COST_CAP)}</h3>
          <div className="cap-bar" aria-hidden="true">
            <span className="cap-bar__spent" style={{ width: pct(finance.capSpent) }} />
            <span className="cap-bar__committed" style={{ width: pct(committed) }} />
          </div>
          <ul className="cap-legend">
            <li>
              <span className="swatch swatch--spent" aria-hidden="true" /> Spent <strong className="num">{formatMoney(finance.capSpent)}</strong>
            </li>
            <li>
              <span className="swatch swatch--committed" aria-hidden="true" /> Set aside for the remaining weekends <strong className="num">{formatMoney(committed)}</strong>
            </li>
            <li>
              <span className="swatch" aria-hidden="true" /> Room for development <strong className="num">{formatMoney(Math.max(0, headroom))}</strong>
            </li>
          </ul>
        </Panel>
        <Panel title="Partners" icon={<Banknote size={16} />}>
          <ul className="sponsors">
            {season.sponsors.map((s) => (
              <li key={s.id}>
                <span className="sponsors__name">{s.name}</span>
                <span className="muted">
                  {formatMoney(s.perRace)} a race · {OBJECTIVE_LABEL[s.objective]}: {formatMoney(s.bonus)} bonus
                </span>
              </li>
            ))}
          </ul>
          <p className="field__help">Bonuses are paid for Grand Prix results of either car (objectives for both cars need both).</p>
        </Panel>
      </div>
      <Panel title="Ledger">
        {finance.ledger.length === 0 ? (
          <p className="muted">No transactions yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="table table--compact">
              <caption className="visually-hidden">Recent income and spending</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Item</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col">Cost cap</th>
                </tr>
              </thead>
              <tbody>
                {finance.ledger.slice(0, 40).map((e, i) => (
                  <tr key={`${e.date}-${i}`}>
                    <td>{formatDate(e.date)}</td>
                    <td>{e.label}</td>
                    <td className={`num ${e.amount >= 0 ? 'is-income' : 'is-spend'}`}>
                      {e.amount >= 0 ? '+' : ''}
                      {formatMoney(e.amount)}
                    </td>
                    <td className="muted">{e.capped ? 'Counts' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------- Inbox ----------

export function InboxPanel({ season, controller }: HqProps) {
  // Messages unread when the inbox was opened stay highlighted while it is open.
  const [fresh] = useState(() => new Set(season.inbox.filter((m) => !m.read).map((m) => m.id)));
  const { update } = controller;
  useEffect(() => {
    update((s) => markRead(s));
  }, [update, season.inbox.length]);
  return (
    <Panel title="Inbox" icon={<Inbox size={16} />}>
      {season.inbox.length === 0 ? (
        <p className="muted">No messages.</p>
      ) : (
        <ul className="inbox">
          {season.inbox.map((m) => (
            <li key={m.id} className={`inbox__msg inbox__msg--${m.tone}${fresh.has(m.id) ? ' is-new' : ''}`}>
              <p className="inbox__meta">
                {fresh.has(m.id) ? <Mail size={14} aria-hidden="true" /> : <MailOpen size={14} aria-hidden="true" />}
                <span>{m.from}</span>
                <span className="muted">· {formatDate(m.date)}</span>
                {fresh.has(m.id) && <span className="tag tag--new">New</span>}
              </p>
              <h3 className="inbox__title">{m.title}</h3>
              <p className="inbox__body">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
