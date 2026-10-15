/**
 * Team finances for the Team Principal career, in millions of US dollars. Amounts are
 * illustrative. The cost cap follows the 2026 figure of $215M; running costs and development
 * count towards it, driver salaries and facility building do not.
 */
import type { Rng } from '../rng';
import { TEAM_TIER } from './development';

export const COST_CAP = 215;
/** Operating cost per race weekend (counts towards the cap). */
export const RUNNING_COST = 5.5;
/** Repair bill after a crash (counts towards the cap). */
export const CRASH_REPAIR = 1.8;

export interface LedgerEntry {
  date: string;
  label: string;
  /** Positive for income, negative for spending. */
  amount: number;
  /** Counts towards the cost cap. */
  capped: boolean;
}

export interface Finance {
  balance: number;
  /** Spending counted towards the cost cap this season. */
  capSpent: number;
  ledger: LedgerEntry[];
}

export type SponsorObjective = 'win' | 'podium' | 'points' | 'bothPoints' | 'bothFinish' | 'topTen';

export interface Sponsor {
  id: string;
  /** Fictional partner names. */
  name: string;
  /** Paid every race weekend. */
  perRace: number;
  objective: SponsorObjective;
  /** Paid when the objective is met in a Grand Prix. */
  bonus: number;
}

export const OBJECTIVE_LABEL: Record<SponsorObjective, string> = {
  win: 'Win a Grand Prix',
  podium: 'Finish on the podium',
  points: 'Score points',
  bothPoints: 'Both cars in the points',
  bothFinish: 'Both cars finish',
  topTen: 'A car in the top ten',
};

const SPONSOR_NAMES = [
  'Northwind Energy',
  'Vantage Telecom',
  'Kestrel Logistics',
  'Arcadia Bank',
  'Helix Software',
  'Solace Watches',
  'Meridian Air',
  'Quarry Outdoor',
  'Lumen Optics',
  'Tidewater Beverages',
];

export interface TeamFinanceProfile {
  balance: number;
  sponsorIncome: number;
  salaries: number;
}

export function financeProfile(teamId: string): TeamFinanceProfile {
  const tier = TEAM_TIER[teamId] ?? 'mid';
  if (tier === 'top') return { balance: 60, sponsorIncome: 9.5, salaries: 3 };
  if (tier === 'works') return { balance: 55, sponsorIncome: 7, salaries: 1 };
  return { balance: 40, sponsorIncome: 7.5, salaries: 1.2 };
}

/** A title partner and two smaller partners, with objectives that suit the team's level. */
export function createSponsors(teamId: string, rng: Rng): Sponsor[] {
  const tier = TEAM_TIER[teamId] ?? 'mid';
  const income = financeProfile(teamId).sponsorIncome;
  const names = [...SPONSOR_NAMES];
  const take = () => names.splice(Math.floor(rng.next() * names.length), 1)[0];
  const objectives: SponsorObjective[] = tier === 'top' ? ['podium', 'bothPoints', 'win'] : tier === 'works' ? ['bothFinish', 'topTen', 'points'] : ['points', 'bothFinish', 'bothPoints'];
  return [
    { id: 'title', name: take(), perRace: Math.round(income * 0.6 * 10) / 10, objective: objectives[0], bonus: tier === 'top' ? 1.2 : 0.8 },
    { id: 'partner-a', name: take(), perRace: Math.round(income * 0.25 * 10) / 10, objective: objectives[1], bonus: 0.6 },
    { id: 'partner-b', name: take(), perRace: Math.round(income * 0.15 * 10) / 10, objective: objectives[2], bonus: tier === 'top' ? 1.5 : 0.5 },
  ];
}

export interface TeamRaceOutcome {
  positions: Array<number | null>;
}

/** Whether a Grand Prix result meets a sponsor objective (positions of both cars, null = DNF). */
export function objectiveMet(objective: SponsorObjective, { positions }: TeamRaceOutcome): boolean {
  const finished = positions.filter((p): p is number => p !== null);
  switch (objective) {
    case 'win':
      return finished.includes(1);
    case 'podium':
      return finished.some((p) => p <= 3);
    case 'points':
    case 'topTen':
      return finished.some((p) => p <= 10);
    case 'bothPoints':
      return finished.length === positions.length && finished.every((p) => p <= 10);
    case 'bothFinish':
      return finished.length === positions.length;
  }
}

/** Records a payment or expense. */
export function post(finance: Finance, entry: LedgerEntry): Finance {
  return {
    balance: Math.round((finance.balance + entry.amount) * 100) / 100,
    capSpent: Math.round((finance.capSpent + (entry.capped && entry.amount < 0 ? -entry.amount : 0)) * 100) / 100,
    ledger: [entry, ...finance.ledger].slice(0, 120),
  };
}

/** Season prize money by constructors' position (paid at the end of the year). */
export function prizeMoney(position: number): number {
  const table = [140, 125, 112, 100, 90, 80, 72, 64, 56, 50, 44];
  return table[position - 1] ?? 40;
}

export function formatMoney(millions: number): string {
  const sign = millions < 0 ? '−' : '';
  return `${sign}$${Math.abs(millions).toFixed(Math.abs(millions) >= 100 ? 0 : 1)}M`;
}
