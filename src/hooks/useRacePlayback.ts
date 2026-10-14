import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BOOST_COST } from '../game/constants';
import { getPlayerCar, validateDecision } from '../game/engine';
import { buildTimelines, finishTime, lineTime, type CarTimeline } from '../game/replay';
import type { PlayerDecision, RaceState } from '../game/types';
import type { RaceController } from './useRaceController';
import type { RaceSpeed } from './settingsStore';

/** A typical lap in real time (s), used to describe the speeds. */
export const TYPICAL_LAP_SECONDS = 90;
/** Cars keep rolling this long (race time) after the last one takes the flag. */
const COOL_DOWN = 6;

export interface Playback {
  /** The race as it stood when the leader last crossed the line (what the panels show). */
  shown: RaceState;
  /** The engine state, one lap ahead while a lap is being run. */
  engine: RaceState;
  /** Latest car timelines (read every frame). */
  timelines(): CarTimeline[];
  /** Current race time (s); read it every frame, it does not trigger renders. */
  clock: { readonly current: number };
  playing: boolean;
  /** True once the lights have gone out. */
  started: boolean;
  /** Every car has taken the flag (or retired) and the replay has stopped. */
  complete: boolean;
  pauseReason: string | null;
  /** Real seconds until the pending call is locked in (null when paused at the line). */
  lockIn: number | null;
  play(): void;
  pause(reason?: string): void;
  toggle(): void;
  /** Jumps to the leader's next crossing of the line. */
  skipLap(): void;
  /** Called every animation frame with the race time. */
  subscribe(listener: (time: number) => void): () => void;
}

interface Options {
  speed: RaceSpeed;
  pauseOnEvents: boolean;
  /** Called when the leader crosses the line and the panels move on a lap. */
  onReveal?: (state: RaceState) => void;
}

/** A decision the engine will accept: drops a stop or boost that is no longer allowed. */
function legalDecision(state: RaceState, decision: PlayerDecision): PlayerDecision {
  if (!validateDecision(state, decision)) return decision;
  const car = getPlayerCar(state);
  const fixed = { ...decision };
  if (fixed.box && (state.lap + 1 >= state.totalLaps || car.allocation[fixed.compound] <= 0)) fixed.box = false;
  if (fixed.boost && (state.safetyCar.active || car.battery < BOOST_COST)) fixed.boost = false;
  return fixed;
}

/** Key moments that pause the race (when the player wants that). */
export function pauseReasonFor(state: RaceState): string | null {
  const player = getPlayerCar(state);
  const events = state.events.filter((e) => e.lap === state.lap);
  const sc = events.find((e) => e.kind === 'safety-car' && /deployed/i.test(e.title));
  if (sc) return sc.title;
  const mine = events.find((e) => e.carId === player.id && e.severity === 'danger');
  if (mine) return mine.title;
  const weather = events.find((e) => e.kind === 'weather' && e.major);
  if (weather) return weather.title;
  return null;
}

/**
 * Runs a race in continuous time. The engine computes a lap the moment the leader starts it,
 * using the player's call at that instant; the map then shows every car on its way round,
 * and the panels catch up when the leader crosses the line.
 */
export function useRacePlayback(controller: RaceController & { race: RaceState }, options: Options): Playback {
  const engine = controller.race;
  const [shown, setShown] = useState(engine);
  const [playing, setPlaying] = useState(false);
  const [complete, setComplete] = useState(engine.phase === 'finished');
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [lockIn, setLockIn] = useState<number | null>(null);
  const [started, setStarted] = useState(engine.lap > 0);

  const clock = useRef(engine.phase === 'finished' ? finishTime(engine) + COOL_DOWN : lineTime(engine, engine.lap));
  const engineRef = useRef(engine);
  const shownRef = useRef(engine);
  const timelinesRef = useRef(buildTimelines(engine));
  const controllerRef = useRef(controller);
  const optionsRef = useRef(options);
  const listeners = useRef(new Set<(time: number) => void>());
  const playingRef = useRef(false);
  const lastLockReport = useRef(0);

  useLayoutEffect(() => {
    controllerRef.current = controller;
    optionsRef.current = options;
  });

  // A different race was loaded (new race, resume, or simulated to the flag): start over from it.
  useLayoutEffect(() => {
    // Laps computed by this hook set engineRef first, so only outside changes get past here.
    if (engine === engineRef.current) return;
    engineRef.current = engine;
    shownRef.current = engine;
    timelinesRef.current = buildTimelines(engine);
    clock.current = engine.phase === 'finished' ? finishTime(engine) + COOL_DOWN : lineTime(engine, engine.lap);
    playingRef.current = false;
    setShown(engine);
    setPlaying(false);
    setComplete(engine.phase === 'finished');
    setPauseReason(null);
    setLockIn(null);
    setStarted(engine.lap > 0);
  }, [engine]);

  const emit = useCallback(() => {
    for (const listener of listeners.current) listener(clock.current);
  }, []);

  const stop = useCallback((reason: string | null) => {
    playingRef.current = false;
    setPlaying(false);
    setPauseReason(reason);
    setLockIn(null);
  }, []);

  const reveal = useCallback(
    (state: RaceState) => {
      shownRef.current = state;
      setShown(state);
      optionsRef.current.onReveal?.(state);
      if (state.phase === 'running' && optionsRef.current.pauseOnEvents && playingRef.current) {
        const reason = pauseReasonFor(state);
        if (reason) stop(reason);
      }
    },
    [stop],
  );

  /** Locks the player's call and computes the lap the leader is about to start. */
  const lockNextLap = useCallback((): RaceState | null => {
    const ctl = controllerRef.current;
    const current = engineRef.current;
    if (ctl.race !== current || current.phase !== 'running') return null;
    const next = ctl.advance(legalDecision(current, ctl.decision));
    if (!next) return null;
    engineRef.current = next;
    timelinesRef.current = buildTimelines(next);
    return next;
  }, []);

  /** Moves race time forward by `delta` seconds, computing and revealing laps on the way. */
  const step = useCallback(
    (delta: number) => {
      let eng = engineRef.current;
      const seen = shownRef.current;
      if (eng.phase === 'running' && eng.lap === seen.lap) {
        const next = lockNextLap();
        if (!next) return; // waiting for React to catch up with the last lap
        eng = next;
      }
      let t = clock.current + delta;
      if (eng.lap > seen.lap) {
        const line = lineTime(eng, eng.lap);
        if (t >= line) {
          t = line;
          clock.current = t;
          reveal(eng);
          return;
        }
      } else if (eng.phase === 'finished') {
        const end = finishTime(eng) + COOL_DOWN;
        if (t >= end) {
          clock.current = end;
          setComplete(true);
          stop(null);
          return;
        }
      }
      clock.current = t;
    },
    [lockNextLap, reveal, stop],
  );

  // Animation loop.
  useEffect(() => {
    if (!playing) return;
    if (typeof requestAnimationFrame !== 'function') return;
    // Speeds are multiples of real time: at 16× a 90-second lap takes under 6 seconds.
    const rate = optionsRef.current.speed;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      step(dt * rate);
      emit();
      if (now - lastLockReport.current > 250) {
        lastLockReport.current = now;
        const eng = engineRef.current;
        setLockIn(eng.lap > shownRef.current.lap && eng.phase === 'running' ? Math.max(0, (lineTime(eng, eng.lap) - clock.current) / rate) : null);
      }
      if (playingRef.current) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, options.speed, step, emit]);

  const play = useCallback(() => {
    if (complete) return;
    setStarted(true);
    setPauseReason(null);
    playingRef.current = true;
    setPlaying(true);
  }, [complete]);

  const pause = useCallback((reason?: string) => stop(reason ?? null), [stop]);

  const toggle = useCallback(() => {
    if (playingRef.current) stop(null);
    else play();
  }, [play, stop]);

  const skipLap = useCallback(() => {
    setStarted(true);
    let eng = engineRef.current;
    const seen = shownRef.current;
    if (seen.phase === 'finished') {
      clock.current = finishTime(eng) + COOL_DOWN;
      emit();
      setComplete(true);
      stop(null);
      return;
    }
    if (eng.lap === seen.lap) {
      const next = lockNextLap();
      if (!next) return;
      eng = next;
    }
    clock.current = lineTime(eng, eng.lap);
    const wasPlaying = playingRef.current;
    reveal(eng);
    emit();
    if (!wasPlaying) setLockIn(null);
  }, [emit, lockNextLap, reveal, stop]);

  const subscribe = useCallback((listener: (time: number) => void) => {
    listeners.current.add(listener);
    listener(clock.current);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const timelines = useCallback(() => timelinesRef.current, []);

  return { shown, engine, timelines, clock, playing, started, complete, pauseReason, lockIn, play, pause, toggle, skipLap, subscribe };
}
