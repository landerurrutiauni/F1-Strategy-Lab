import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CIRCUITS, nextRound } from './game/data/circuits';
import { DEFAULT_PLAYER_DRIVER_ID, isDriverId } from './game/data/teams';
import { isCompoundId } from './game/data/tyres';
import { loadActiveRace } from './game/persistence';
import { randomSeed } from './game/rng';
import { createSeason, currentSession, recordRace } from './game/season/season';
import type { RaceConfig, RaceLength, RaceState, ScenarioId } from './game/types';
import { useRaceController } from './hooks/useRaceController';
import { useSeason } from './hooks/useSeason';
import { BriefingScreen } from './screens/BriefingScreen';
import { AboutScreen, HowToPlayScreen, RecordsScreen, SettingsScreen } from './screens/InfoScreens';
import { MenuScreen } from './screens/MenuScreen';
import { RaceScreen } from './screens/RaceScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SeasonScreen } from './screens/season/SeasonScreen';
import { SeasonSetupScreen } from './screens/season/SeasonSetupScreen';

type Screen = 'menu' | 'briefing' | 'race' | 'results' | 'howto' | 'records' | 'settings' | 'about' | 'season' | 'season-setup';

const TITLES: Record<Screen, string> = {
  menu: 'F1 Strategy Lab',
  briefing: 'Race briefing | F1 Strategy Lab',
  race: 'Live race | F1 Strategy Lab',
  results: 'Results | F1 Strategy Lab',
  howto: 'How to play | F1 Strategy Lab',
  records: 'Records | F1 Strategy Lab',
  settings: 'Settings | F1 Strategy Lab',
  about: 'About | F1 Strategy Lab',
  season: '2026 season | F1 Strategy Lab',
  'season-setup': 'New season | F1 Strategy Lab',
};

/** True when a saved race is the unfinished Sprint or Grand Prix that a season session would start. */
const sameSessionRace = (race: RaceState | null | undefined, config: RaceConfig) =>
  !!race &&
  race.phase === 'running' &&
  race.config.seasonRound === config.seasonRound &&
  race.config.session === config.session &&
  race.config.seed === config.seed &&
  race.config.playerDriverId === config.playerDriverId;

const SCENARIO_IDS: ScenarioId[] = ['none', 'safety-car-early', 'safety-car-late', 'storm', 'drying'];

const urlParams = () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams());

const isValidSeed = (seed: number) => Number.isInteger(seed) && seed > 0 && seed <= 999999999;

/** Default briefing settings, optionally pre-filled from the URL (handy for sharing and tests). */
function initialConfig(): RaceConfig {
  const params = urlParams();
  const seed = Number(params.get('seed'));
  const laps = Number(params.get('laps'));
  const circuit = params.get('circuit');
  const driver = params.get('driver');
  const start = params.get('tyre');
  const weather = params.get('weather');
  const difficulty = params.get('difficulty');
  const scenario = params.get('scenario') as ScenarioId | null;
  return {
    circuitId: circuit && CIRCUITS.some((c) => c.id === circuit) ? circuit : nextRound().id,
    playerDriverId: isDriverId(driver) ? driver : DEFAULT_PLAYER_DRIVER_ID,
    laps: laps === 10 || laps === 20 ? (laps as RaceLength) : 15,
    startCompound: isCompoundId(start) ? start : 'medium',
    weather: weather === 'variable' || weather === 'rainy' ? weather : 'dry',
    difficulty: difficulty === 'easy' || difficulty === 'hard' ? difficulty : 'normal',
    seed: isValidSeed(seed) ? seed : randomSeed(),
    scenario: scenario && SCENARIO_IDS.includes(scenario) ? scenario : 'none',
  };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [config, setConfig] = useState<RaceConfig>(initialConfig);
  // A seed given in the URL is kept for the first new race; later races draw a fresh one.
  const keepUrlSeed = useRef(isValidSeed(Number(urlParams().get('seed'))));
  const controller = useRaceController();
  const seasonCtl = useSeason();
  const { update: updateSeason } = seasonCtl;

  // On screen changes, move focus to the new content so keyboard and screen reader users
  // land on it. Skipped on first load so the first Tab still reaches the skip link.
  const shownScreen = useRef(screen);
  useEffect(() => {
    document.title = TITLES[screen];
    if (shownScreen.current === screen) return;
    shownScreen.current = screen;
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [screen]);

  const startRace = useCallback(
    (cfg: RaceConfig) => {
      controller.start(cfg);
      setScreen('race');
    },
    [controller],
  );

  const raceAgain = useCallback(() => {
    const next = { ...config, seed: randomSeed() };
    setConfig(next);
    startRace(next);
  }, [config, startRace]);

  const { race } = controller;

  // A finished season race goes straight into the championship (recordRace ignores repeats).
  useEffect(() => {
    if (race && race.phase === 'finished' && race.config.seasonRound) updateSeason((s) => recordRace(s, race));
  }, [race, updateSeason]);

  /** Starts a season Sprint or Grand Prix, resuming it when it is already under way. */
  const startSeasonRace = useCallback(
    (cfg: RaceConfig) => {
      if (sameSessionRace(controller.race, cfg)) {
        setScreen('race');
        return;
      }
      if (sameSessionRace(loadActiveRace()?.state, cfg) && controller.resume()) {
        setScreen('race');
        return;
      }
      startRace(cfg);
    },
    [controller, startRace],
  );

  // Lap of an unfinished race for the season's current session, offered as a resume.
  const season = seasonCtl.season;
  const seasonResumeLap = useMemo(() => {
    if (screen !== 'season' || !season || season.phase !== 'weekend') return null;
    const session = currentSession(season);
    const saved = race?.phase === 'running' ? race : loadActiveRace()?.state;
    if (!saved || saved.phase !== 'running' || saved.config.seasonRound !== season.round || saved.config.session !== session) return null;
    return saved.lap + 1;
  }, [screen, season, race]);

  let content: React.ReactNode;
  if (screen === 'race' && race) {
    content = (
      <RaceScreen
        controller={{ ...controller, race }}
        onLeave={() => setScreen(race.config.seasonRound && season ? 'season' : 'menu')}
        onShowResults={() => setScreen('results')}
      />
    );
  } else if (screen === 'results' && race && race.phase === 'finished') {
    content = (
      <ResultsScreen
        race={race}
        saveStatus={controller.saveStatus}
        onRaceAgain={raceAgain}
        onMenu={() => setScreen('menu')}
        onContinueSeason={race.config.seasonRound && season ? () => setScreen('season') : undefined}
      />
    );
  } else if (screen === 'season' && season) {
    content = (
      <SeasonScreen
        controller={seasonCtl}
        resumeLap={seasonResumeLap}
        onMenu={() => setScreen('menu')}
        onNewSeason={() => setScreen('season-setup')}
        onStartRace={startSeasonRace}
      />
    );
  } else if (screen === 'season-setup') {
    content = (
      <SeasonSetupScreen
        initial={{ playerDriverId: season?.config.playerDriverId ?? config.playerDriverId, difficulty: season?.config.difficulty ?? config.difficulty }}
        hasSeason={!!season && season.phase !== 'finished'}
        onBack={() => setScreen('menu')}
        onStart={(cfg) => {
          seasonCtl.replace(createSeason(cfg));
          setScreen('season');
        }}
      />
    );
  } else if (screen === 'briefing') {
    content = <BriefingScreen config={config} onChange={setConfig} onStart={startRace} onBack={() => setScreen('menu')} />;
  } else if (screen === 'howto') {
    content = <HowToPlayScreen onBack={() => setScreen('menu')} />;
  } else if (screen === 'records') {
    content = <RecordsScreen onBack={() => setScreen('menu')} />;
  } else if (screen === 'settings') {
    content = <SettingsScreen onBack={() => setScreen('menu')} />;
  } else if (screen === 'about') {
    content = <AboutScreen onBack={() => setScreen('menu')} />;
  } else {
    content = (
      <MenuScreen
        onNewRace={() => {
          if (keepUrlSeed.current) keepUrlSeed.current = false;
          else setConfig((c) => ({ ...c, seed: randomSeed() }));
          setScreen('briefing');
        }}
        onResume={() => {
          if (controller.resume()) setScreen('race');
        }}
        season={season}
        onSeason={() => setScreen(season ? 'season' : 'season-setup')}
        onNewSeason={() => setScreen('season-setup')}
        onNavigate={setScreen}
      />
    );
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {content}
    </>
  );
}
