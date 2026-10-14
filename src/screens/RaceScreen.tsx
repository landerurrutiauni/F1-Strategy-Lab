import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Flag, Trophy } from 'lucide-react';
import { CircuitMap, type MapCar } from '../components/CircuitMap';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DecisionPanel } from '../components/race/DecisionPanel';
import { RaceFeed } from '../components/race/RaceFeed';
import { RaceHeader } from '../components/race/RaceHeader';
import { StrategyPanel } from '../components/race/StrategyPanel';
import { Telemetry } from '../components/race/Telemetry';
import { TyrePanel } from '../components/race/TyrePanel';
import { WeatherRadar } from '../components/race/WeatherRadar';
import { TimingTower } from '../components/TimingTower';
import { BOOST_COST } from '../game/constants';
import { getCircuit } from '../game/data/circuits';
import { getDriver, getTeam } from '../game/data/teams';
import { getPlayerCar, playerEngineer } from '../game/engine';
import { estimateRejoin, evaluateStrategies } from '../game/projection';
import type { PaceMode, RaceState } from '../game/types';
import { mapFractions, towerRows } from '../game/view';
import type { RaceController } from '../hooks/useRaceController';
import { useReducedMotion, useSettings } from '../hooks/useSettings';
import { useSound } from '../hooks/useSound';

interface RaceScreenProps {
  controller: RaceController & { race: RaceState };
  onLeave: () => void;
  onShowResults: () => void;
}

const PACE_KEYS: Record<string, PaceMode> = { '1': 'conserve', '2': 'standard', '3': 'push' };

function announce(next: RaceState): string {
  const player = getPlayerCar(next);
  const lapEvents = next.events.filter((e) => e.lap === next.lap && (e.major || e.carId === player.id));
  const head =
    next.phase === 'finished'
      ? 'Chequered flag.'
      : `Lap ${next.lap} complete.${player.status === 'running' ? ` You are P${player.position}.` : ''}`;
  return [head, ...lapEvents.map((e) => e.title)].join(' ');
}

export function RaceScreen({ controller, onLeave, onShowResults }: RaceScreenProps) {
  const { race, decision, decisionError, updateDecision, advance, finishAfterRetirement } = controller;
  const { settings, update } = useSettings();
  const reducedMotion = useReducedMotion();
  const play = useSound();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');

  const circuit = getCircuit(race.config.circuitId);
  const player = getPlayerCar(race);
  const engineer = playerEngineer(race);

  // Projections are pure functions of the race state, recomputed once per lap.
  const outlook = useMemo(() => evaluateStrategies(race, player.id), [race, player.id]);
  const rejoin = useMemo(() => estimateRejoin(race, player.id), [race, player.id]);
  const rows = useMemo(() => towerRows(race), [race]);
  const mapCars = useMemo<MapCar[]>(() => {
    const fractions = mapFractions(race);
    return race.cars
      .filter((c) => c.status === 'running')
      .map((c) => ({
        id: c.id,
        code: getDriver(c.driverId).code,
        color: getTeam(c.teamId).color,
        position: c.position,
        isPlayer: c.isPlayer,
        fraction: fractions.get(c.id) ?? 0,
      }));
  }, [race]);

  const handleAdvance = useCallback(() => {
    const next = advance();
    if (!next) return;
    setLiveMessage(announce(next));
    const lapEvents = next.events.filter((e) => e.lap === next.lap);
    if (next.phase === 'finished') play('finish');
    else if (lapEvents.some((e) => e.kind === 'safety-car' || (e.kind === 'weather' && e.major))) play('alert');
    else if (lapEvents.some((e) => e.kind === 'pit' && e.carId === player.id)) play('pit');
    else play('lap');
  }, [advance, play, player.id]);

  const handleFinish = useCallback(() => {
    const next = finishAfterRetirement();
    if (next) setLiveMessage(announce(next));
  }, [finishAfterRetirement]);

  const requestLeave = useCallback(() => {
    if (settings.confirmLeave && race.phase === 'running') setConfirmLeave(true);
    else onLeave();
  }, [settings.confirmLeave, race.phase, onLeave]);

  // Keyboard shortcuts; handler kept in a ref so the listener is attached once.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  const handleKey = (e: KeyboardEvent) => {
    if (confirmLeave || race.phase !== 'running' || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text')) return;
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (PACE_KEYS[key] && !race.safetyCar.active) {
      updateDecision({ pace: PACE_KEYS[key] });
    } else if (key === 'b' && race.lap + 1 < race.totalLaps) {
      updateDecision({ box: !decision.box });
    } else if (key === 'e' && !race.safetyCar.active && player.battery >= BOOST_COST) {
      updateDecision({ boost: !decision.boost });
    } else if (key === 'n') {
      e.preventDefault();
      handleAdvance();
    }
  };
  useLayoutEffect(() => {
    keyHandler.current = handleKey;
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const finishedEntry = race.classification?.find((e) => e.carId === player.id);

  return (
    <div className={`race${race.safetyCar.active ? ' is-sc' : ''}`}>
      <RaceHeader race={race} onLeave={requestLeave} />
      <p className="visually-hidden" aria-live="polite" role="status">
        {liveMessage}
      </p>

      <main id="main" tabIndex={-1} className="race__grid">
        <section className="race__map panel panel--map" aria-label="Track map">
          <div className="map-frame" style={{ ['--rain' as string]: race.weather.rain }}>
            <CircuitMap
              circuit={circuit}
              cars={mapCars}
              lapKey={race.lap}
              safetyCar={race.safetyCar.active}
              reducedMotion={reducedMotion}
              title={`${circuit.name} track map with live car positions`}
            />
            {race.weather.rain >= 0.05 && <div className="map-frame__rain" aria-hidden="true" />}
            <p className="map-frame__caption muted">
              Positions as the leader crosses the line. Your car: {getDriver(player.driverId).code}, ringed.
            </p>
            {race.safetyCar.active && (
              <p className="map-frame__banner" role="note">
                Safety Car: no overtaking, pit stops cost about half
              </p>
            )}
          </div>
        </section>

        <aside className="race__tower panel" aria-label="Timing tower">
          <TimingTower
            rows={rows}
            gapMode={settings.gapMode}
            lapKey={race.lap}
            reducedMotion={reducedMotion}
            onToggleGapMode={() => update({ gapMode: settings.gapMode === 'interval' ? 'leader' : 'interval' })}
          />
        </aside>

        <div className="race__deck">
          {race.phase === 'finished' ? (
            <section className="deck deck--finished" aria-labelledby="finish-title">
              <Flag className="deck__flag" size={28} aria-hidden="true" />
              <h2 id="finish-title" className="deck__title display">
                {finishedEntry?.status === 'finished' ? `P${finishedEntry.position}` : 'Did not finish'}
              </h2>
              <p className="deck__explain">
                {finishedEntry?.status === 'finished'
                  ? `${getDriver(player.driverId).name} takes the chequered flag in P${finishedEntry.position} of ${race.cars.length}.`
                  : `${getDriver(player.driverId).name} retired on lap ${player.retiredLap}.`}{' '}
                {controller.saveStatus.kind === 'saved' && 'Result saved to your records.'}
                {controller.saveStatus.kind === 'error' && `The result could not be saved: ${controller.saveStatus.message}`}
              </p>
              <button type="button" className="btn btn--primary btn--xl" onClick={onShowResults}>
                <Trophy size={18} aria-hidden="true" />
                <span className="btn__label">See results</span>
              </button>
            </section>
          ) : (
            <DecisionPanel
              race={race}
              decision={decision}
              decisionError={decisionError}
              outlook={outlook}
              rejoin={rejoin}
              showProjections={settings.showProjections}
              onChange={updateDecision}
              onAdvance={handleAdvance}
              onFinishAfterRetirement={handleFinish}
            />
          )}
        </div>

        <div className="race__side">
          {player.status === 'running' && <TyrePanel race={race} car={player} pace={decision.pace} outlook={settings.showProjections ? outlook : null} />}
          <StrategyPanel race={race} car={player} outlook={outlook} showProjections={settings.showProjections} />
          <WeatherRadar race={race} collapsible />
        </div>

        <div className="race__telemetry">
          <Telemetry race={race} collapsible />
        </div>
        <div className="race__feed">
          <RaceFeed events={race.events} engineer={engineer} currentLap={race.lap} collapsible />
        </div>
      </main>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave the race?"
        confirmLabel="Leave race"
        onConfirm={() => {
          setConfirmLeave(false);
          onLeave();
        }}
        onCancel={() => setConfirmLeave(false)}
      >
        <p>Your race is saved after every lap. You can resume it from the main menu.</p>
      </ConfirmDialog>
    </div>
  );
}
