import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Flag, Trophy } from 'lucide-react';
import { CircuitMap, type LiveFeed, type MapCar } from '../components/CircuitMap';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DecisionPanel } from '../components/race/DecisionPanel';
import { CallLockNote, PlaybackBar, StartLights } from '../components/race/PlaybackControls';
import { RaceFeed } from '../components/race/RaceFeed';
import { RaceHeader } from '../components/race/RaceHeader';
import { StrategyPanel } from '../components/race/StrategyPanel';
import { Telemetry } from '../components/race/Telemetry';
import { TyrePanel } from '../components/race/TyrePanel';
import { WeatherRadar } from '../components/race/WeatherRadar';
import { TimingTower } from '../components/TimingTower';
import { BOOST_COST, PACE_MODES } from '../game/constants';
import { COMPOUNDS } from '../game/data/tyres';
import { TyreBadge } from '../components/TyreBadge';
import { getCircuit } from '../game/data/circuits';
import { getDriver, getTeam } from '../game/data/teams';
import { defaultDecision, getManagedCars, getPlayerCar, playerEngineer } from '../game/engine';
import { estimateRejoin, evaluateStrategies } from '../game/projection';
import type { CarState, PaceMode, PlayerDecision, RaceState } from '../game/types';
import { towerRows } from '../game/view';
import type { RaceController } from '../hooks/useRaceController';
import { useRacePlayback } from '../hooks/useRacePlayback';
import { useReducedMotion, useSettings } from '../hooks/useSettings';
import { useSound } from '../hooks/useSound';

interface RaceScreenProps {
  controller: RaceController & { race: RaceState };
  onLeave: () => void;
  onShowResults: () => void;
}

const PACE_KEYS: Record<string, PaceMode> = { '1': 'conserve', '2': 'standard', '3': 'push' };

function announce(next: RaceState): string {
  const managed = getManagedCars(next);
  const ids = new Set(managed.map((c) => c.id));
  const lapEvents = next.events.filter((e) => e.lap === next.lap && (e.major || (e.carId !== undefined && ids.has(e.carId))));
  const running = managed.filter((c) => c.status === 'running');
  const where =
    managed.length > 1
      ? running.map((c) => `${getDriver(c.driverId).code} P${c.position}`).join(', ')
      : running[0]
        ? `You are P${running[0].position}.`
        : '';
  const head = next.phase === 'finished' ? 'Chequered flag.' : `Lap ${next.lap} complete. ${where}`;
  return [head, ...lapEvents.map((e) => e.title)].join(' ');
}

export function RaceScreen({ controller, onLeave, onShowResults }: RaceScreenProps) {
  const { decisions, decisionErrors, updateDecision, finishAfterRetirement } = controller;
  const engine = controller.race;
  const { settings, update } = useSettings();
  const reducedMotion = useReducedMotion();
  const play = useSound();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [lights, setLights] = useState<number | null>(null);

  // Announcements and sound cues each time the leader crosses the line.
  const onReveal = useCallback(
    (next: RaceState) => {
      if (next.lap === 0) return;
      setLiveMessage(announce(next));
      const mine = new Set(getManagedCars(next).map((c) => c.id));
      const lapEvents = next.events.filter((e) => e.lap === next.lap);
      if (next.phase === 'finished') play('finish');
      else if (lapEvents.some((e) => e.kind === 'safety-car' || (e.kind === 'weather' && e.major))) play('alert');
      else if (lapEvents.some((e) => e.kind === 'pit' && e.carId !== undefined && mine.has(e.carId))) play('pit');
      else play('lap');
    },
    [play],
  );
  const playback = useRacePlayback(controller, { speed: settings.raceSpeed, pauseOnEvents: settings.pauseOnEvents, onReveal });
  // The panels show the race as of the leader's last crossing of the line; the engine is a lap ahead.
  const race = playback.shown;

  const circuit = getCircuit(race.config.circuitId);
  // With both cars of a team the panels and the call follow the car in focus.
  const managed = getManagedCars(engine);
  const [focusId, setFocusId] = useState(managed[0].id);
  const player = race.cars.find((c) => c.id === focusId) ?? getPlayerCar(race);
  const enginePlayer = engine.cars.find((c) => c.id === focusId) ?? getPlayerCar(engine);
  const decision = decisions[focusId] ?? defaultDecision(engine, focusId);
  const decisionError = decisionErrors[focusId] ?? null;
  const setDecision = useCallback((patch: Partial<PlayerDecision>) => updateDecision(focusId, patch), [updateDecision, focusId]);
  const engineerFor = useCallback((carId: string | undefined) => playerEngineer(race, carId), [race]);
  const switchCar = useCallback(() => {
    const i = managed.findIndex((c) => c.id === focusId);
    setFocusId(managed[(i + 1) % managed.length].id);
  }, [managed, focusId]);

  // Projections plan the pending call, so they start from the engine state.
  const outlook = useMemo(() => evaluateStrategies(engine, enginePlayer.id), [engine, enginePlayer.id]);
  const rejoin = useMemo(() => estimateRejoin(engine, enginePlayer.id), [engine, enginePlayer.id]);
  const rows = useMemo(() => towerRows(race), [race]);
  const mapCars = useMemo<MapCar[]>(
    () =>
      race.cars.map((c) => ({
        id: c.id,
        code: getDriver(c.driverId).code,
        color: getTeam(c.teamId).color,
        position: c.position,
        isPlayer: c.isPlayer,
        fraction: 0,
      })),
    [race],
  );

  // Safety Car laps: those already run, plus the next one when the Safety Car is out.
  const scInfo = useRef({ lapStatus: engine.lapStatus, nextLap: engine.lap + 1, active: engine.safetyCar.active });
  useLayoutEffect(() => {
    scInfo.current = { lapStatus: engine.lapStatus, nextLap: engine.lap + 1, active: engine.safetyCar.active };
  });
  const { subscribe, timelines } = playback;
  const live = useMemo<LiveFeed>(
    () => ({
      subscribe,
      timelines,
      safetyCarLap: (lap) => scInfo.current.lapStatus[lap] === 'sc' || (lap === scInfo.current.nextLap && scInfo.current.active),
    }),
    [subscribe, timelines],
  );

  // Start lights: five reds, then lights out and the race runs.
  const { play: startPlayback, started } = playback;
  const lightsOut = useCallback(() => {
    if (lights !== null || started) return;
    if (reducedMotion) startPlayback();
    else setLights(0);
  }, [lights, started, reducedMotion, startPlayback]);
  useEffect(() => {
    if (lights === null) return;
    const id = window.setTimeout(
      () => {
        if (lights < 5) setLights(lights + 1);
        else {
          setLights(null);
          startPlayback();
        }
      },
      lights < 5 ? 550 : 350 + Math.random() * 650,
    );
    return () => window.clearTimeout(id);
  }, [lights, startPlayback]);

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
    if (confirmLeave || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text')) return;
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (key === ' ' || e.code === 'Space') {
      // Space on a focused control activates that control instead.
      if (target && target.closest('button, a, summary, label, input')) return;
      e.preventDefault();
      if (!playback.started) lightsOut();
      else playback.toggle();
      return;
    }
    if (key === 'n' && !playback.complete) {
      e.preventDefault();
      playback.skipLap();
      return;
    }
    if (key === 'c' && managed.length > 1) {
      switchCar();
      return;
    }
    if (engine.phase !== 'running') return;
    if (PACE_KEYS[key] && !engine.safetyCar.active) {
      setDecision({ pace: PACE_KEYS[key] });
    } else if (key === 'b' && engine.lap + 1 < engine.totalLaps) {
      setDecision({ box: !decision.box });
    } else if (key === 'e' && !engine.safetyCar.active && enginePlayer.battery >= BOOST_COST) {
      setDecision({ boost: !decision.boost });
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

  const controls = engine.phase === 'running' ? <CallLockNote playback={playback} nextLap={engine.lap + 1} /> : null;

  const finishedEntry = race.classification?.find((e) => e.carId === player.id);
  const teamEntries = getManagedCars(race).map((c) => ({ car: c, entry: race.classification?.find((e) => e.carId === c.id) }));

  return (
    <div className={`race${race.safetyCar.active ? ' is-sc' : ''}`}>
      <RaceHeader race={race} onLeave={requestLeave} started={playback.started} />
      <p className="visually-hidden" aria-live="polite" role="status">
        {liveMessage}
      </p>

      <main id="main" tabIndex={-1} className="race__grid">
        <section className="race__map panel panel--map" aria-label="Track map">
          <div className="map-frame" style={{ ['--rain' as string]: race.weather.rain }}>
            <CircuitMap
              circuit={circuit}
              cars={mapCars}
              live={live}
              reducedMotion={reducedMotion}
              title={`${circuit.name} track map with live car positions`}
            />
            {lights !== null && <StartLights lit={lights} />}
            {race.weather.rain >= 0.05 && <div className="map-frame__rain" aria-hidden="true" />}
            <p className="map-frame__caption muted">
              Live: every car runs its own lap times. {managed.length > 1 ? 'Your cars' : 'Your car'}:{' '}
              {managed.map((c) => getDriver(c.driverId).code).join(' and ')}, ringed. Panels update as the leader crosses the line.
            </p>
            {race.safetyCar.active && (
              <p className="map-frame__banner" role="note">
                Safety Car: no overtaking, pit stops cost about half
              </p>
            )}
          </div>
          <PlaybackBar
            playback={playback}
            speed={settings.raceSpeed}
            onSpeed={(raceSpeed) => update({ raceSpeed })}
            onLightsOut={lightsOut}
            lightsRunning={lights !== null}
          />
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
                {teamEntries.length > 1
                  ? teamEntries.map(({ car, entry }) => `${getDriver(car.driverId).code} ${entry?.status === 'finished' ? 'P' + entry.position : 'DNF'}`).join('  ·  ')
                  : finishedEntry?.status === 'finished'
                    ? `P${finishedEntry.position}`
                    : 'Did not finish'}
              </h2>
              <p className="deck__explain">
                {teamEntries
                  .map(({ car, entry }) =>
                    entry?.status === 'finished'
                      ? `${getDriver(car.driverId).name} takes the chequered flag in P${entry.position} of ${race.cars.length}.`
                      : `${getDriver(car.driverId).name} retired on lap ${car.retiredLap}.`,
                  )
                  .join(' ')}{' '}
                {controller.saveStatus.kind === 'saved' && 'Result saved to your records.'}
                {controller.saveStatus.kind === 'error' && `The result could not be saved: ${controller.saveStatus.message}`}
              </p>
              <button type="button" className="btn btn--primary btn--xl" onClick={onShowResults}>
                <Trophy size={18} aria-hidden="true" />
                <span className="btn__label">See results</span>
              </button>
              {!playback.complete && <p className="muted">The rest of the field is still crossing the line.</p>}
            </section>
          ) : engine.phase === 'finished' ? (
            <section className="deck" aria-labelledby="deck-title">
              <header className="deck__head">
                <h2 id="deck-title" className="deck__title">
                  Final lap
                </h2>
                <p className="deck__explain">All calls are made. The chequered flag waits for the leader at the end of this lap.</p>
              </header>
              <div className="deck__actions">{controls}</div>
            </section>
          ) : (
            <>
              {managed.length > 1 && (
                <CarSwitcher engine={engine} cars={getManagedCars(race)} focusId={focusId} decisions={decisions} onFocus={setFocusId} />
              )}
              <DecisionPanel
                key={focusId}
                race={engine}
                carId={focusId}
                decision={decision}
                decisionError={decisionError}
                outlook={outlook}
                rejoin={rejoin}
                showProjections={settings.showProjections}
                onChange={setDecision}
                onFinishAfterRetirement={handleFinish}
                controls={controls}
              />
            </>
          )}
        </div>

        <div className="race__side">
          {player.status === 'running' && <TyrePanel race={race} car={player} pace={decision.pace} outlook={settings.showProjections ? outlook : null} />}
          <StrategyPanel race={race} car={player} outlook={outlook} showProjections={settings.showProjections} />
          <WeatherRadar race={race} collapsible />
        </div>

        <div className="race__telemetry">
          <Telemetry race={race} carId={player.id} collapsible />
        </div>
        <div className="race__feed">
          <RaceFeed events={race.events} engineer={engineerFor} currentLap={race.lap} collapsible />
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

/** Tabs for the managed cars, with each car's position and pending call. */
function CarSwitcher({
  engine,
  cars,
  focusId,
  decisions,
  onFocus,
}: {
  engine: RaceState;
  cars: CarState[];
  focusId: string;
  decisions: Record<string, PlayerDecision>;
  onFocus: (id: string) => void;
}) {
  return (
    <div className="car-switch" role="tablist" aria-label="Your cars">
      {cars.map((car) => {
        const d = decisions[car.id];
        const driver = getDriver(car.driverId);
        const active = car.id === focusId;
        return (
          <button
            key={car.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`car-switch__tab${active ? ' is-active' : ''}`}
            onClick={() => onFocus(car.id)}
            aria-keyshortcuts="C"
          >
            <span className="team-dot" style={{ background: getTeam(car.teamId).color }} aria-hidden="true" />
            <span className="car-switch__code">{driver.code}</span>
            <span className="car-switch__pos num">{car.status === 'running' ? `P${car.position}` : 'Out'}</span>
            <TyreBadge compound={car.tyre.compound} size={18} />
            <span className="car-switch__call muted">
              {car.status !== 'running'
                ? 'Retired'
                : d?.box && engine.lap + 1 < engine.totalLaps
                  ? `Box for ${COMPOUNDS[d.compound].name.toLowerCase()}s`
                  : d
                    ? PACE_MODES[d.pace].label
                    : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
