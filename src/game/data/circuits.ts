import type { CircuitSpec } from '../types';
import { CIRCUIT_OUTLINES } from './circuitOutlines';

type CircuitInput = Omit<CircuitSpec, 'outline' | 'sprint'>;

/** The six 2026 Sprint weekends (Formula 1 and FIA announcement). */
export const SPRINT_WEEKENDS = new Set(['shanghai', 'miami', 'montreal', 'silverstone', 'zandvoort', 'marina-bay']);

/**
 * The 2026 Formula 1 calendar: 23 rounds (the Saudi Arabian Grand Prix was cancelled and the
 * Bahrain Grand Prix moved to Sepang). Layouts come from the bacinger/f1-circuits dataset (MIT
 * licence), rotated to match the official circuit maps (see circuitOutlines.ts).
 *
 * Lap times, pit losses, degradation, overtaking difficulty, weather and Safety Car likelihood
 * are rounded, illustrative values chosen for gameplay. They are inspired by each venue's
 * character, not official or measured data.
 */
const DATA: CircuitInput[] = [
  {
    id: 'albert-park', round: 1, grandPrix: 'Australian Grand Prix', weekend: '06–08 Mar', raceDate: '2026-03-08', laps: 58,
    name: 'Albert Park', fullName: 'Albert Park Circuit', region: 'Melbourne, Australia',
    lengthKm: 5.278, corners: 14, baseLapTime: 80.5, degradation: 0.95, pitLaneLoss: 19.5, overtakeDelta: 0.7,
    rainPropensity: 0.35, trackTemp: 32, safetyCarChance: 0.45, sector: 'street',
    summary: 'A fast park circuit around a lake. Walls are close and Safety Cars are common, so a flexible plan pays off.',
    traits: ['Medium tyre wear', 'Frequent Safety Cars', 'Short pit-lane loss', 'Passing is possible into turns 1, 3 and 11'],
  },
  {
    id: 'shanghai', round: 2, grandPrix: 'Chinese Grand Prix', weekend: '13–15 Mar', raceDate: '2026-03-15', laps: 56, sprintLaps: 19,
    name: 'Shanghai', fullName: 'Shanghai International Circuit', region: 'Shanghai, China',
    lengthKm: 5.451, corners: 16, baseLapTime: 96.5, degradation: 1.15, pitLaneLoss: 23, overtakeDelta: 0.5,
    rainPropensity: 0.35, trackTemp: 28, safetyCarChance: 0.3, sector: 'flowing',
    summary: 'The never-ending turn 1 and a 1.2 km back straight. Front tyres take a beating, and the hairpin is a prime passing spot.',
    traits: ['Medium-high tyre wear', 'Long back straight helps passing', 'Spring showers possible', 'Average pit-lane loss'],
  },
  {
    id: 'suzuka', round: 3, grandPrix: 'Japanese Grand Prix', weekend: '27–29 Mar', raceDate: '2026-03-29', laps: 53,
    name: 'Suzuka', fullName: 'Suzuka International Racing Course', region: 'Suzuka, Japan',
    lengthKm: 5.807, corners: 18, baseLapTime: 94, degradation: 1.2, pitLaneLoss: 22.5, overtakeDelta: 0.9,
    rainPropensity: 0.45, trackTemp: 30, safetyCarChance: 0.3, sector: 'flowing',
    summary: 'The only figure-of-eight on the calendar. The Esses punish worn tyres and passing is difficult, so undercuts are powerful.',
    traits: ['High tyre wear through the Esses', 'Hard to overtake', 'Rain is possible', 'Average pit-lane loss'],
  },
  {
    id: 'miami', round: 4, grandPrix: 'Miami Grand Prix', weekend: '01–03 May', raceDate: '2026-05-03', laps: 57, sprintLaps: 19,
    name: 'Miami', fullName: 'Miami International Autodrome', region: 'Miami Gardens, United States',
    lengthKm: 5.412, corners: 19, baseLapTime: 92, degradation: 1.05, pitLaneLoss: 20, overtakeDelta: 0.6,
    rainPropensity: 0.35, trackTemp: 45, safetyCarChance: 0.4, sector: 'street',
    summary: 'Hot, slippery and fast around the stadium. Three long straights help passing, but afternoon storms can roll in.',
    traits: ['Very hot track', 'Tropical storms possible', 'Good passing on the straights', 'Short pit-lane loss'],
  },
  {
    id: 'montreal', round: 5, grandPrix: 'Canadian Grand Prix', weekend: '22–24 May', raceDate: '2026-05-24', laps: 70, sprintLaps: 23,
    name: 'Montréal', fullName: 'Circuit Gilles Villeneuve', region: 'Montréal, Canada',
    lengthKm: 4.361, corners: 14, baseLapTime: 76, degradation: 0.85, pitLaneLoss: 18.5, overtakeDelta: 0.5,
    rainPropensity: 0.45, trackTemp: 32, safetyCarChance: 0.55, sector: 'street',
    summary: 'Stop-start straights and chicanes on an island, with the Wall of Champions waiting. Safety Cars and showers shake up strategy.',
    traits: ['Low tyre wear', 'Very high Safety Car risk', 'One of the cheapest pit stops', 'Easy passing into the final chicane'],
  },
  {
    id: 'monaco', round: 6, grandPrix: 'Monaco Grand Prix', weekend: '05–07 Jun', raceDate: '2026-06-07', laps: 78,
    name: 'Monaco', fullName: 'Circuit de Monaco', region: 'Monte Carlo, Monaco',
    lengthKm: 3.337, corners: 19, baseLapTime: 74.5, degradation: 0.75, pitLaneLoss: 19.5, overtakeDelta: 1.6,
    rainPropensity: 0.3, trackTemp: 42, safetyCarChance: 0.5, sector: 'street',
    summary: 'Barriers everywhere and almost no overtaking. Track position is everything, so stop timing and any Safety Car decide the race.',
    traits: ['Lowest tyre wear of the season', 'Passing needs a huge pace advantage', 'High Safety Car risk', 'Short pit-lane loss'],
  },
  {
    id: 'barcelona', round: 7, grandPrix: 'Barcelona-Catalunya Grand Prix', weekend: '12–14 Jun', raceDate: '2026-06-14', laps: 66,
    name: 'Barcelona', fullName: 'Circuit de Barcelona-Catalunya', region: 'Montmeló, Spain',
    lengthKm: 4.657, corners: 14, baseLapTime: 79, degradation: 1.3, pitLaneLoss: 21.5, overtakeDelta: 0.75,
    rainPropensity: 0.2, trackTemp: 42, safetyCarChance: 0.2, sector: 'abrasive',
    summary: 'Long, loaded corners and a hot, abrasive surface. Tyre management and stint length matter more than raw pace.',
    traits: ['High tyre wear', 'Passing mainly into turn 1', 'Few Safety Cars', 'Two-stop races are common'],
  },
  {
    id: 'red-bull-ring', round: 8, grandPrix: 'Austrian Grand Prix', weekend: '26–28 Jun', raceDate: '2026-06-28', laps: 71,
    name: 'Red Bull Ring', fullName: 'Red Bull Ring', region: 'Spielberg, Austria',
    lengthKm: 4.318, corners: 10, baseLapTime: 68.5, degradation: 1, pitLaneLoss: 20, overtakeDelta: 0.45,
    rainPropensity: 0.45, trackTemp: 38, safetyCarChance: 0.25, sector: 'speed',
    summary: 'The shortest lap of the year: three big braking zones up and down the Styrian hills. Passing is easy and mountain showers are common.',
    traits: ['Shortest lap time', 'Easy overtaking', 'Mountain showers possible', 'Tight midfield gaps'],
  },
  {
    id: 'silverstone', round: 9, grandPrix: 'British Grand Prix', weekend: '03–05 Jul', raceDate: '2026-07-05', laps: 52, sprintLaps: 17,
    name: 'Silverstone', fullName: 'Silverstone Circuit', region: 'Northamptonshire, United Kingdom',
    lengthKm: 5.891, corners: 18, baseLapTime: 90, degradation: 1.25, pitLaneLoss: 20.5, overtakeDelta: 0.6,
    rainPropensity: 0.6, trackTemp: 30, safetyCarChance: 0.25, sector: 'speed',
    summary: 'High-speed corners like Maggotts and Becketts load the tyres heavily, and British showers often arrive mid-race.',
    traits: ['High tyre wear from fast corners', 'Showers are a real possibility', 'Reasonable overtaking chances', 'Short pit-lane loss'],
  },
  {
    id: 'spa', round: 10, grandPrix: 'Belgian Grand Prix', weekend: '17–19 Jul', raceDate: '2026-07-19', laps: 44,
    name: 'Spa-Francorchamps', fullName: 'Circuit de Spa-Francorchamps', region: 'Stavelot, Belgium',
    lengthKm: 7.004, corners: 19, baseLapTime: 106, degradation: 1, pitLaneLoss: 20, overtakeDelta: 0.5,
    rainPropensity: 0.8, trackTemp: 24, safetyCarChance: 0.3, sector: 'flowing',
    summary: 'The longest lap on the calendar, through the Ardennes forest. Showers roll in quickly, so the radar is your best friend.',
    traits: ['Changeable weather is common', 'Cool track keeps wear moderate', 'Kemmel straight makes passing possible', 'Medium pit-lane loss'],
  },
  {
    id: 'hungaroring', round: 11, grandPrix: 'Hungarian Grand Prix', weekend: '24–26 Jul', raceDate: '2026-07-26', laps: 70,
    name: 'Hungaroring', fullName: 'Hungaroring', region: 'Mogyoród, Hungary',
    lengthKm: 4.381, corners: 14, baseLapTime: 80.5, degradation: 1.1, pitLaneLoss: 20.5, overtakeDelta: 1.2,
    rainPropensity: 0.3, trackTemp: 45, safetyCarChance: 0.2, sector: 'flowing',
    summary: 'Twisty, hot and dusty: "Monaco without the walls". Overtaking is hard, so the undercut is the main weapon.',
    traits: ['Hot track, medium-high wear', 'Very hard to overtake', 'Undercuts work well', 'Few Safety Cars'],
  },
  {
    id: 'zandvoort', round: 12, grandPrix: 'Dutch Grand Prix', weekend: '21–23 Aug', raceDate: '2026-08-23', laps: 72, sprintLaps: 24,
    name: 'Zandvoort', fullName: 'Circuit Zandvoort', region: 'Zandvoort, Netherlands',
    lengthKm: 4.259, corners: 14, baseLapTime: 74, degradation: 1.1, pitLaneLoss: 21, overtakeDelta: 1.1,
    rainPropensity: 0.5, trackTemp: 28, safetyCarChance: 0.35, sector: 'flowing',
    summary: 'A rollercoaster in the dunes with steep banked corners. Narrow and hard to pass on, with North Sea weather in play.',
    traits: ['Banked corners load the tyres', 'Hard to overtake', 'Coastal showers possible', 'Gravel traps punish mistakes'],
  },
  {
    id: 'monza', round: 13, grandPrix: 'Italian Grand Prix', weekend: '04–06 Sep', raceDate: '2026-09-06', laps: 53,
    name: 'Monza', fullName: 'Autodromo Nazionale Monza', region: 'Monza, Italy',
    lengthKm: 5.793, corners: 11, baseLapTime: 81, degradation: 0.9, pitLaneLoss: 24.5, overtakeDelta: 0.4,
    rainPropensity: 0.3, trackTemp: 38, safetyCarChance: 0.25, sector: 'speed',
    summary: 'The Temple of Speed: long straights, heavy slipstream and chicanes. Passing is easy, but the long pit lane makes every stop expensive.',
    traits: ['Moderate tyre wear', 'Easiest circuit for overtaking', 'Long, costly pit lane', 'A one-stop is usually enough'],
  },
  {
    id: 'madring', round: 14, grandPrix: 'Spanish Grand Prix', weekend: '11–13 Sep', raceDate: '2026-09-13', laps: 57,
    name: 'Madring', fullName: 'Circuito de Madring', region: 'Madrid, Spain',
    lengthKm: 5.414, corners: 22, baseLapTime: 88, degradation: 1.1, pitLaneLoss: 22, overtakeDelta: 0.7,
    rainPropensity: 0.15, trackTemp: 35, safetyCarChance: 0.4, sector: 'street',
    summary: 'A new semi-street circuit around the IFEMA exhibition centre, with the banked La Monumental corner. Walls make Safety Cars likely.',
    traits: ['New layout: few reference points', 'Semi-street: Safety Cars likely', 'Medium tyre wear', 'Dry late-summer weather'],
  },
  {
    id: 'baku', round: 15, grandPrix: 'Azerbaijan Grand Prix', weekend: '24–26 Sep', raceDate: '2026-09-26', laps: 51,
    name: 'Baku', fullName: 'Baku City Circuit', region: 'Baku, Azerbaijan',
    lengthKm: 6.003, corners: 20, baseLapTime: 104, degradation: 0.8, pitLaneLoss: 20.5, overtakeDelta: 0.5,
    rainPropensity: 0.15, trackTemp: 35, safetyCarChance: 0.55, sector: 'street',
    summary: 'A 2.2 km flat-out run along the seafront and a narrow castle section. Low tyre wear and frequent Safety Cars.',
    traits: ['Low tyre wear', 'Very high Safety Car risk', 'Huge slipstream: easy passing', 'Medium pit-lane loss'],
  },
  {
    id: 'sepang', round: 16, grandPrix: 'Bahrain Grand Prix', weekend: '02–04 Oct', raceDate: '2026-10-04', laps: 56,
    name: 'Sepang', fullName: 'Sepang International Circuit', region: 'Sepang, Malaysia (Bahrain GP relocated)',
    lengthKm: 5.543, corners: 15, baseLapTime: 97, degradation: 1.45, pitLaneLoss: 21, overtakeDelta: 0.55,
    rainPropensity: 0.75, trackTemp: 50, safetyCarChance: 0.25, sector: 'abrasive',
    summary: 'The 2026 Bahrain Grand Prix moved to Sepang. Searing heat destroys tyres, and tropical downpours can arrive in minutes.',
    traits: ['Very high tyre wear and heat', 'Tropical storms are common', 'Two long straights for passing', 'Two-stop races are likely'],
  },
  {
    id: 'marina-bay', round: 17, grandPrix: 'Singapore Grand Prix', weekend: '09–11 Oct', raceDate: '2026-10-11', laps: 62, sprintLaps: 21,
    name: 'Marina Bay', fullName: 'Marina Bay Street Circuit', region: 'Singapore',
    lengthKm: 4.928, corners: 19, baseLapTime: 95, degradation: 0.95, pitLaneLoss: 28, overtakeDelta: 1.2,
    rainPropensity: 0.4, trackTemp: 36, safetyCarChance: 0.6, sector: 'street',
    summary: 'A humid night race between the walls. The longest pit-lane loss on the calendar makes a Safety Car stop hugely valuable.',
    traits: ['Longest pit-lane loss', 'Highest Safety Car risk', 'Hard to overtake', 'Humid with evening storms'],
  },
  {
    id: 'cota', round: 18, grandPrix: 'United States Grand Prix', weekend: '23–25 Oct', raceDate: '2026-10-25', laps: 56,
    name: 'Austin', fullName: 'Circuit of the Americas', region: 'Austin, United States',
    lengthKm: 5.514, corners: 20, baseLapTime: 98, degradation: 1.15, pitLaneLoss: 21, overtakeDelta: 0.6,
    rainPropensity: 0.25, trackTemp: 35, safetyCarChance: 0.3, sector: 'flowing',
    summary: 'A steep climb to turn 1 and a fast esses sequence inspired by Silverstone. Bumpy, demanding and good for overtaking.',
    traits: ['Medium-high tyre wear', 'Good overtaking into turns 1 and 12', 'Bumpy surface', 'Average pit-lane loss'],
  },
  {
    id: 'mexico-city', round: 19, grandPrix: 'Mexico City Grand Prix', weekend: '30 Oct–01 Nov', raceDate: '2026-11-01', laps: 71,
    name: 'Mexico City', fullName: 'Autódromo Hermanos Rodríguez', region: 'Mexico City, Mexico',
    lengthKm: 4.304, corners: 17, baseLapTime: 80, degradation: 0.95, pitLaneLoss: 22.5, overtakeDelta: 0.6,
    rainPropensity: 0.2, trackTemp: 40, safetyCarChance: 0.3, sector: 'speed',
    summary: 'Thin air at 2,200 m means little downforce and a huge tow down the main straight. Tyres slide and overheat.',
    traits: ['High altitude, low grip', 'Long run to turn 1', 'Tyres overheat easily', 'Average pit-lane loss'],
  },
  {
    id: 'interlagos', round: 20, grandPrix: 'São Paulo Grand Prix', weekend: '06–08 Nov', raceDate: '2026-11-08', laps: 71,
    name: 'Interlagos', fullName: 'Autódromo José Carlos Pace', region: 'São Paulo, Brazil',
    lengthKm: 4.309, corners: 15, baseLapTime: 73, degradation: 1.1, pitLaneLoss: 21, overtakeDelta: 0.5,
    rainPropensity: 0.6, trackTemp: 40, safetyCarChance: 0.45, sector: 'flowing',
    summary: 'A short, anticlockwise lap with elevation and a long uphill drag to the line. Sudden storms make it a strategist’s race.',
    traits: ['Sudden storms are common', 'Good overtaking into turn 1', 'Frequent Safety Cars', 'Short lap'],
  },
  {
    id: 'las-vegas', round: 21, grandPrix: 'Las Vegas Grand Prix', weekend: '19–21 Nov', raceDate: '2026-11-21', laps: 50,
    name: 'Las Vegas', fullName: 'Las Vegas Strip Circuit', region: 'Las Vegas, United States',
    lengthKm: 6.201, corners: 17, baseLapTime: 95, degradation: 0.7, pitLaneLoss: 21, overtakeDelta: 0.45,
    rainPropensity: 0.05, trackTemp: 18, safetyCarChance: 0.35, sector: 'street',
    summary: 'A cold night race down the Strip. Long straights make passing easy; the challenge is keeping tyres in their window.',
    traits: ['Cold track: low wear', 'Very long straights', 'Easy passing', 'Rain is very rare'],
  },
  {
    id: 'lusail', round: 22, grandPrix: 'Qatar Grand Prix', weekend: '27–29 Nov', raceDate: '2026-11-29', laps: 57,
    name: 'Lusail', fullName: 'Lusail International Circuit', region: 'Lusail, Qatar',
    lengthKm: 5.38, corners: 16, baseLapTime: 84, degradation: 1.5, pitLaneLoss: 25, overtakeDelta: 0.8,
    rainPropensity: 0.02, trackTemp: 30, safetyCarChance: 0.2, sector: 'abrasive',
    summary: 'Fast, flowing corners load the tyres for almost the whole lap. Tyre life drives the strategy here.',
    traits: ['Very high tyre wear', 'Long pit-lane loss', 'Passing mainly into turn 1', 'Rain is virtually unknown'],
  },
  {
    id: 'yas-marina', round: 23, grandPrix: 'Abu Dhabi Grand Prix', weekend: '04–06 Dec', raceDate: '2026-12-06', laps: 58,
    name: 'Yas Marina', fullName: 'Yas Marina Circuit', region: 'Abu Dhabi, United Arab Emirates',
    lengthKm: 5.281, corners: 16, baseLapTime: 88, degradation: 0.95, pitLaneLoss: 22, overtakeDelta: 0.6,
    rainPropensity: 0.02, trackTemp: 32, safetyCarChance: 0.25, sector: 'flowing',
    summary: 'The season finale under the lights. Two long straights give passing chances; a one-stop is the usual plan.',
    traits: ['Medium tyre wear', 'Track cools as the sun sets', 'Passing into turns 5 and 9', 'Rain is virtually unknown'],
  },
];

export const CIRCUITS: CircuitSpec[] = DATA.map((c) => ({ ...c, outline: CIRCUIT_OUTLINES[c.id], sprint: SPRINT_WEEKENDS.has(c.id) }));

/**
 * Pre-season testing venue: two three-day tests at Sakhir (11–13 and 18–20 February 2026).
 * Not a 2026 Grand Prix, so it is not part of the calendar above.
 */
export const TESTING_CIRCUIT: CircuitSpec = {
  id: 'sakhir', round: 0, grandPrix: 'Pre-season testing', weekend: '11–13 & 18–20 Feb', raceDate: '2026-02-20', laps: 57,
  name: 'Sakhir', fullName: 'Bahrain International Circuit', region: 'Sakhir, Bahrain',
  lengthKm: 5.412, corners: 15, baseLapTime: 92, degradation: 1.25, pitLaneLoss: 23, overtakeDelta: 0.6,
  rainPropensity: 0, trackTemp: 30, safetyCarChance: 0, sector: 'abrasive',
  summary: 'Two three-day tests in the desert: the only running before the season. Abrasive asphalt and gusty winds make it a tough tyre test.',
  traits: ['Abrasive surface', 'Wind affects balance', 'Night running cools the track'],
  outline: CIRCUIT_OUTLINES.sakhir,
  sprint: false,
};

export function getCircuit(id: string): CircuitSpec {
  const circuit = CIRCUITS.find((c) => c.id === id);
  if (!circuit) throw new Error(`Unknown circuit: ${id}`);
  return circuit;
}

export function isCircuitId(id: unknown): id is string {
  return typeof id === 'string' && CIRCUITS.some((c) => c.id === id);
}

/** The next round on the calendar on or after `today` (the final round once the season is over). */
export function nextRound(today: Date = new Date()): CircuitSpec {
  const day = today.toISOString().slice(0, 10);
  return CIRCUITS.find((c) => c.raceDate >= day) ?? CIRCUITS[CIRCUITS.length - 1];
}
