import { useCallback, useEffect, useState } from 'react';
import { CIRCUITS, nextRound } from './game/data/circuits';
import { DEFAULT_PLAYER_DRIVER_ID, isDriverId } from './game/data/teams';
import { isCompoundId } from './game/data/tyres';
import { randomSeed } from './game/rng';
import type { RaceConfig, RaceLength, ScenarioId } from './game/types';
import { useRaceController } from './hooks/useRaceController';
import { BriefingScreen } from './screens/BriefingScreen';
import { AboutScreen, HowToPlayScreen, RecordsScreen, SettingsScreen } from './screens/InfoScreens';
import { MenuScreen } from './screens/MenuScreen';
import { RaceScreen } from './screens/RaceScreen';
import { ResultsScreen } from './screens/ResultsScreen';

type Screen = 'menu' | 'briefing' | 'race' | 'results' | 'howto' | 'records' | 'settings' | 'about';

const TITLES: Record<Screen, string> = {
  menu: 'F1 Strategy Lab',
  briefing: 'Race briefing | F1 Strategy Lab',
  race: 'Live race | F1 Strategy Lab',
  results: 'Results | F1 Strategy Lab',
  howto: 'How to play | F1 Strategy Lab',
  records: 'Records | F1 Strategy Lab',
  settings: 'Settings | F1 Strategy Lab',
  about: 'About | F1 Strategy Lab',
};

const SCENARIO_IDS: ScenarioId[] = ['none', 'safety-car-early', 'safety-car-late', 'storm', 'drying'];

/** Default briefing settings, optionally pre-filled from the URL (handy for sharing and tests). */
function initialConfig(): RaceConfig {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
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
    seed: Number.isInteger(seed) && seed > 0 && seed <= 999999999 ? seed : randomSeed(),
    scenario: scenario && SCENARIO_IDS.includes(scenario) ? scenario : 'none',
  };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [config, setConfig] = useState<RaceConfig>(initialConfig);
  const controller = useRaceController();

  useEffect(() => {
    document.title = TITLES[screen];
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

  let content: React.ReactNode;
  if (screen === 'race' && race) {
    content = <RaceScreen controller={{ ...controller, race }} onLeave={() => setScreen('menu')} onShowResults={() => setScreen('results')} />;
  } else if (screen === 'results' && race && race.phase === 'finished') {
    content = <ResultsScreen race={race} saveStatus={controller.saveStatus} onRaceAgain={raceAgain} onMenu={() => setScreen('menu')} />;
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
          setConfig((c) => ({ ...c, seed: randomSeed() }));
          setScreen('briefing');
        }}
        onResume={() => {
          if (controller.resume()) setScreen('race');
        }}
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
