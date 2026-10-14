# F1 Strategy Lab

A single-player race-strategy game that runs entirely in the browser. You are the strategist on the pit wall for one driver of the 2026 grid: choose the pace, the tyres and the moment to stop, read the weather radar, react to Safety Cars, and see how your calls compare with the best plan available at the time.

Play a single race, or a whole **2026 season**: pre-season testing in Bahrain, then all 23 rounds with practice, qualifying, Sprints and Grands Prix, and both championships.

> Unofficial fan-made game. Not affiliated with, endorsed by or connected to Formula 1, the FIA, Formula One Management or any team. No official logos or artwork are used; team, driver and circuit names are used only to describe the real season the game is inspired by.

## Features

- **Quick race** on any of the 23 rounds of the 2026 calendar, with any of the 22 drivers (real teams, numbers and race engineers), 10, 15 or 20 laps, dry, variable or wet weather, three difficulty levels and optional event drills (early or late Safety Car, incoming storm, drying track).
- **Season mode**:
  - Pre-season testing at Sakhir: two three-day tests (11–13 and 18–20 February). Each day you choose a programme (aero mapping, race simulations, pit-stop practice, reliability mileage) that improves your car for the whole season.
  - Standard weekends: Practice 1, 2 and 3, Qualifying, Grand Prix.
  - Sprint weekends at the six 2026 Sprint venues (Shanghai, Miami, Montréal, Silverstone, Zandvoort, Singapore): Practice 1, Sprint Qualifying, Sprint, Qualifying, Grand Prix.
  - Practice programmes (setup work, long runs, qualifying simulations) build weekend preparation; wet sessions teach less.
  - Knock-out qualifying (six cars out in Q1 and Q2, top ten in Q3) with your tyre and run-plan choice per segment. Sprint Qualifying uses mediums in SQ1/SQ2 and softs in SQ3 when dry.
  - Run Sprints and Grands Prix live on the pit wall, or let the team strategist simulate them.
  - 2026 points (25-18-15-12-10-8-6-4-2-1 and 8-7-6-5-4-3-2-1, no fastest-lap point), drivers' and constructors' standings with countback, in-season upgrades, mechanical reliability, weekend weather forecasts and a season review.
- **Live race**: after the start lights the race runs in real time. All 22 cars lap the real circuit at their own lap times (overtakes, pit-lane stops at the box, the Safety Car leading the pack, retirements), with pause, 1×–8× speed, a next-lap skip and automatic pauses for key moments. Your call for the next lap locks in when the leader starts it. Alongside: timing tower with animated position changes, tyre panel (wear gauge, useful life, pit window, wrong-tyre warning), strategy outlook (projected 0/1/2-stop plans, pit-now delta, rejoin estimate), five-lap weather radar, race control and team radio feed, telemetry charts, overtake boost, keyboard shortcuts.
- **Results**: classification, gaps, pit stops, stint chart, telemetry, major events, an explainable strategy rating (pit calls, tyre management, weather calls, execution; luck reported separately), key decisions and a lap-by-lap summary.
- **Records** and the season are stored in `localStorage` (versioned and validated). An unfinished race is saved every lap and can be resumed.
- Accessibility: keyboard play, visible focus, skip link, live announcements, reduced-motion setting (also follows the OS preference), colour never the only signal.

## Tech stack

React 19 + TypeScript (strict) + Vite, Lucide icons, self-hosted variable fonts (Saira for display, Archivo for UI) via Fontsource. Vitest + Testing Library for unit and component tests, Playwright for end-to-end tests, oxlint for linting. No backend, no API keys, no tracking.

## Getting started

```bash
npm ci            # install exactly what package-lock.json lists
npm run dev       # http://localhost:5173
```

Useful URL parameters for sharing a race or testing: `?seed=4242&circuit=monza&laps=10&driver=ver&tyre=soft&weather=variable&difficulty=hard&scenario=storm`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | oxlint |
| `npm run typecheck` | TypeScript project build check |
| `npm test` | Unit and component tests (Vitest, jsdom) |
| `npm run test:e2e` | Playwright end-to-end tests against the production build |

For the end-to-end tests Playwright needs Chromium: `npx playwright install chromium` (or set `PLAYWRIGHT_CHROMIUM_PATH` to an existing Chromium binary).

## Project structure

```
src/
  game/                 Simulation engine (pure TypeScript, no React)
    engine.ts           createRace, advanceLap, validation, events
    lapTime.ts          lap-time model
    tyreModel.ts        wear, degradation, wetness suitability, failures
    weather.ts          rain timeline, wetness, forecast radar
    projection.ts       strategy projection (0/1/2-stop plans)
    ai.ts               rival strategists
    rating.ts           strategy rating
    classification.ts   final classification and penalties
    persistence.ts      records and the race in progress
    season/             season mode: calendar, testing, practice, qualifying, championship
    data/               2026 teams, drivers, calendar, tyres, circuit outlines
  components/           UI components (timing tower, map, charts, panels)
  screens/              Menu, briefing, race, results, info pages, season screens
  hooks/                race controller, season controller, settings, sound
  styles/               design tokens and component styles
e2e/                    Playwright tests
scripts/build-circuits.mjs   converts the circuit dataset into game outlines
```

## Simulation model

**Live playback** (`src/game/replay.ts`, `src/hooks/useRacePlayback.ts`): the engine still works lap by lap, one lap ahead of what you see. When the leader starts a lap, that lap is computed for the whole field with your current call. Every car's lap records become a timeline, so the map can place each car at any moment: from its grid slot, at its own pace through the lap, down the pit lane with the stationary stop at its box, stopped on track after a retirement, and over the line at the flag. The timing tower and panels move on when the leader crosses the line, so nothing is revealed early. At 1× a lap takes about 12 seconds.

All randomness comes from a seeded generator (mulberry32) whose state is stored in the race state, so **the same seed and the same decisions always give the same race**. `advanceLap(state, decision)` is pure: it clones the state, simulates one lap for all 22 cars and returns the new state. The constants below live in `src/game/constants.ts` and `src/game/data/tyres.ts`.

**Lap time** (seconds):

```
lap = circuit base
    − 0.07 × (lap − 1)                 fuel burn
    + team car pace + driver skill (+ difficulty adjustment for rivals, + season effects)
    + compound offset                   soft 0, medium +0.45, hard +0.85
    + degradation(wear)                 (0.9·x + 3.4·x⁴) × compound sensitivity, x = wear/100
    + 8.5 × wetness + wrong-tyre penalty for the track wetness
    + pace mode                         conserve +0.45, standard 0, push −0.35
    + warm-up on a fresh set, − 0.3 with the overtake boost, + 2.6 on the opening lap
    + driver-consistency noise
```

**Tyre wear per lap** = compound base wear (soft 6.4%, medium 4.2%, hard 3.0%, …) × circuit degradation × pace multiplier (conserve 0.65, push 1.6) × track-temperature factor × wetness factor × driver smoothness × season effects. Above 85% wear the chance of a failure ramps up (a failure costs about 24 s and forces a stop).

**Weather**: a per-race rain timeline drives track wetness (wets at 0.65 × rain per lap, dries at 0.28 per lap). The radar shows five laps ahead with uncertainty that grows with distance; beyond that it shows a climate estimate.

**Pit stops**: pit-lane loss of the circuit (about 18–25 s) plus a stationary time of 2.6 ± 0.2 s, with 7% slow stops and 7% quick ones. Under the Safety Car the lane loss is halved. In a dry Grand Prix two different dry compounds are compulsory (40 s penalty otherwise); Sprints have no such rule.

**Traffic and overtaking**: a faster car that catches the car ahead attempts a pass with probability `logistic((pace advantage ± boost − circuit overtaking difficulty) / 0.35)`; a failed attempt leaves it in dirty air.

**Safety Car**: triggered by crashes or random debris (circuit-specific likelihood). The field closes up, nobody can overtake, wear drops to 25% and pit stops cost about half.

**Strategy projection**: for the player (and the AI), every remaining zero-, one- and two-stop plan within the tyre allocation is evaluated with the same lap-time and wear formulas, with an expected cost for tyre-failure risk. Outputs are labelled as estimates: they ignore traffic and future Safety Cars.

**AI**: each team has a profile (aggressive, balanced, conservative, adaptive) that shapes its plan, how early it stops, how it reacts to Safety Cars and weather (reaction chance by difficulty) and when it pushes or uses the boost.

**Strategy rating**: pit calls 40% (time lost against the best plan available when each call was made), tyre management 25%, weather calls 20%, execution 15%. Luck (Safety Car timing, failures) is reported separately and does not change the score.

### Season model

- **Testing**: each day closes about a third of the remaining gap in one area. Effects for the season: up to −0.25 s per lap (pace), −12% tyre wear, −0.45 s per stop, and lower mechanical-failure risk. Rival teams get their own pre-season development.
- **Practice**: up to −0.18 s per lap from setup, −8% tyre wear from long runs and −0.12 s on a qualifying lap from qualifying simulations, for that weekend only.
- **Qualifying**: one flying lap per run with low fuel, track evolution (Q2 −0.15 s, Q3 −0.3 s), tyre and wetness effects, noise, traffic (one late run) and mistakes or deleted laps (more likely in the wet and on riskier plans).
- **Reliability**: in season races each car has a small per-lap chance of a mechanical retirement, from the team's reliability and its testing mileage.
- **In-season development**: after every round each team's form drifts a little; big steps are reported as upgrades that worked or failed.
- **Sprints** are about half the Grand Prix distance (5, 8 or 10 laps).

All performance values (team pace, driver ratings, circuit characteristics, reliability) are illustrative numbers chosen for gameplay, not official or measured data.

## Real-world data

- **Teams, drivers, car numbers and race engineers**: the 2026 grid (11 teams, 22 drivers).
- **Calendar**: the 2026 calendar as raced, 23 rounds (the Saudi Arabian Grand Prix was cancelled and the Bahrain Grand Prix moved to Sepang), with the six Sprint weekends announced by Formula 1 and the FIA.
- **Circuit layouts**: real track geometry from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT licence), converted by `scripts/build-circuits.mjs`, rotated to match the orientation of the official circuit maps, ordered in racing direction and starting at the start/finish line. The Bahrain International Circuit is used for pre-season testing.

## Deploying to GitHub Pages

The site is fully static and uses relative asset paths (`base: './'`), so it works from any Pages URL.

`.github/workflows/deploy.yml` runs on every push to the repository's default branch (`claude/f1-strategy-lab-game-s91ao4`) or `main`, and on manual dispatch. It installs dependencies with `npm ci`, runs lint, type-check, unit tests, the build and the Playwright end-to-end tests, then uploads `dist/` with `actions/upload-pages-artifact` and publishes it with `actions/deploy-pages`. Permissions are limited to `contents: read`, `pages: write` and `id-token: write`.

One-time setup (needs a repository admin; a workflow token is not allowed to switch Pages on):

1. In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
2. In the **Actions** tab, open the latest **Deploy to GitHub Pages** run and choose **Re-run all jobs** (or push a new commit).
3. The site is then published at `https://landerurrutiauni.github.io/F1-Strategy-Lab/`; the deploy job also prints the URL.

## Limitations

- The model is deliberately simplified: no fuel-saving modes, no blue flags, no virtual Safety Car or red flags, no penalties other than the compound rule, and no damage from contact.
- Strategy projections ignore traffic and future Safety Cars, and the weather may not follow the radar.
- Car and driver ratings are illustrative and do not track real form.
- Races are compressed to 10–20 laps, so stints and gaps are shorter than in reality.
- Progress lives in this browser's `localStorage`; clearing site data removes records and the season.

## Credits

- Circuit layouts: [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), © 2019–2025 Tomislav Bacinger, MIT licence.
- Fonts: Saira and Archivo (SIL Open Font License), self-hosted via Fontsource.
- Icons: [Lucide](https://lucide.dev) (ISC licence).
