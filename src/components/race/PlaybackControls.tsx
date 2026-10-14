import { CirclePause, Pause, Play, SkipForward } from 'lucide-react';
import type { Playback } from '../../hooks/useRacePlayback';
import { RACE_SPEEDS, type RaceSpeed } from '../../hooks/settingsStore';
import { Segmented } from '../Segmented';

interface PlaybackBarProps {
  playback: Playback;
  speed: RaceSpeed;
  onSpeed: (speed: RaceSpeed) => void;
  /** Starts the lights sequence (before the start). */
  onLightsOut: () => void;
  lightsRunning: boolean;
}

/** Play, pause, speed and lap skip for the live race, shown under the map. */
export function PlaybackBar({ playback, speed, onSpeed, onLightsOut, lightsRunning }: PlaybackBarProps) {
  const { playing, started, complete, pauseReason } = playback;
  return (
    <div className="transport">
      {pauseReason && (
        <p className="transport__paused" role="status">
          <CirclePause size={16} aria-hidden="true" /> Paused: {pauseReason}. Make your call, then resume.
        </p>
      )}
      <div className="transport__row">
        {started ? (
          <button type="button" className="btn btn--primary transport__main" onClick={playback.toggle} disabled={complete} aria-keyshortcuts="Space">
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
            <span className="btn__label">{complete ? 'Race over' : playing ? 'Pause' : 'Resume'}</span>
          </button>
        ) : (
          <button type="button" className="btn btn--primary transport__main" onClick={onLightsOut} disabled={lightsRunning} aria-keyshortcuts="Space">
            <Play size={18} aria-hidden="true" />
            <span className="btn__label">{lightsRunning ? 'Lights…' : 'Lights out'}</span>
          </button>
        )}
        <Segmented<RaceSpeed>
          legend="Speed"
          hideLegend
          className="transport__speed"
          value={speed}
          onChange={onSpeed}
          options={RACE_SPEEDS.map((s) => ({ value: s, label: `${s}×`, ariaLabel: `Speed ${s} times` }))}
        />
        <button type="button" className="btn btn--ghost btn--small" onClick={playback.skipLap} disabled={complete || lightsRunning} aria-keyshortcuts="N">
          <SkipForward size={15} aria-hidden="true" /> Next lap
        </button>
      </div>
    </div>
  );
}

/** When the pending call is locked in. */
export function CallLockNote({ playback, nextLap }: { playback: Playback; nextLap: number }) {
  const { playing, started, lockIn } = playback;
  return (
    <p className="playback__lock muted">
      {!started
        ? 'Set your call for lap 1, then press Lights out. The race runs on its own; pause whenever you need time to think.'
        : lockIn !== null && playing
          ? `Your call for lap ${nextLap} locks in ${Math.ceil(lockIn)} s, when the leader starts that lap.`
          : `Your call for lap ${nextLap} stays open until the leader starts that lap.`}
      <span className="deck__keys">
        {' '}
        Keys: <kbd>Space</kbd> pause, <kbd>N</kbd> next lap, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> pace, <kbd>B</kbd> box, <kbd>E</kbd> boost.
      </span>
    </p>
  );
}

/** Five red lights, then lights out. */
export function StartLights({ lit }: { lit: number }) {
  return (
    <div className="start-lights" role="img" aria-label={lit >= 5 ? 'All five red lights on' : `${lit} of five red lights on`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`start-lights__pod${i < lit ? ' is-lit' : ''}`}>
          <span />
          <span />
        </span>
      ))}
    </div>
  );
}
