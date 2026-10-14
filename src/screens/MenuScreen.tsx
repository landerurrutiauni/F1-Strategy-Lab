import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, History, Info, Play, RotateCcw, Settings as SettingsIcon } from 'lucide-react';
import { circuitGeometry } from '../game/trackGeometry';
import { CIRCUITS, getCircuit, nextRound } from '../game/data/circuits';
import { getDriver } from '../game/data/teams';
import { loadActiveRace } from '../game/persistence';
import { useReducedMotion } from '../hooks/useSettings';

interface MenuScreenProps {
  onNewRace: () => void;
  onResume: () => void;
  onNavigate: (screen: 'howto' | 'records' | 'settings' | 'about') => void;
}

/** Animated backdrop: a car lapping each real circuit in turn. */
function MenuTrack({ reducedMotion }: { reducedMotion: boolean }) {
  const [index, setIndex] = useState(() => Math.max(0, CIRCUITS.indexOf(nextRound())));
  const circuit = CIRCUITS[index % CIRCUITS.length];
  const geometry = useMemo(() => circuitGeometry(circuit), [circuit]);
  const dotRef = useRef<SVGCircleElement>(null);
  const trailRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (reducedMotion) {
      const p = geometry.pointAt(0.12);
      dotRef.current?.setAttribute('cx', String(p.x));
      dotRef.current?.setAttribute('cy', String(p.y));
      return;
    }
    let frame = 0;
    const t0 = performance.now();
    const LAP_MS = 9000;
    const tick = (now: number) => {
      const t = (now - t0) / LAP_MS;
      if (t >= 1) {
        setIndex((i) => i + 1);
        return;
      }
      const eased = t;
      const p = geometry.pointAt(eased);
      dotRef.current?.setAttribute('cx', p.x.toFixed(1));
      dotRef.current?.setAttribute('cy', p.y.toFixed(1));
      trailRef.current?.setAttribute('stroke-dashoffset', String(1000 - eased * 1000));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [geometry, reducedMotion]);

  return (
    <div className="menu__track" aria-hidden="true">
      <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet">
        <path d={geometry.path} className="menu__track-base" />
        <path ref={trailRef} d={geometry.path} className="menu__track-trail" pathLength={1000} strokeDasharray="1000" strokeDashoffset={reducedMotion ? 0 : 1000} />
        <circle ref={dotRef} r={7} className="menu__track-dot" />
      </svg>
      <p className="menu__track-name">
        Round {circuit.round}: {circuit.grandPrix}, {circuit.fullName}
      </p>
    </div>
  );
}

export function MenuScreen({ onNewRace, onResume, onNavigate }: MenuScreenProps) {
  const reducedMotion = useReducedMotion();
  const [saved] = useState(() => loadActiveRace());
  const savedSummary = saved
    ? `${getDriver(saved.state.config.playerDriverId).code} at the ${getCircuit(saved.state.config.circuitId).grandPrix}, lap ${saved.state.lap + 1} of ${saved.state.totalLaps}`
    : null;

  return (
    <div className="menu">
      <MenuTrack reducedMotion={reducedMotion} />
      <main id="main" tabIndex={-1} className="menu__content">
        <h1 className="menu__title display">
          <span>F1</span> <span>Strategy</span> <span>Lab</span>
        </h1>
        <p className="menu__lede">
          You run the pit wall. Pick a driver from the 2026 grid, read the tyres and the radar, and make the calls that win or lose the race.
        </p>
        <nav className="menu__nav" aria-label="Main menu">
          <button type="button" className="btn btn--primary btn--xl" onClick={onNewRace}>
            <Play size={18} aria-hidden="true" />
            <span className="btn__label">New race</span>
          </button>
          {savedSummary && (
            <button type="button" className="btn btn--secondary menu__resume" onClick={onResume}>
              <RotateCcw size={16} aria-hidden="true" />
              <span>
                Resume race
                <span className="btn__sub">{savedSummary}</span>
              </span>
            </button>
          )}
          <div className="menu__links">
            <button type="button" className="btn btn--ghost" onClick={() => onNavigate('howto')}>
              <BookOpen size={16} aria-hidden="true" /> How to play
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => onNavigate('records')}>
              <History size={16} aria-hidden="true" /> Records
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => onNavigate('settings')}>
              <SettingsIcon size={16} aria-hidden="true" /> Settings
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => onNavigate('about')}>
              <Info size={16} aria-hidden="true" /> About
            </button>
          </div>
        </nav>
      </main>
      <footer className="menu__footer muted">
        Unofficial fan-made game. Not affiliated with Formula 1, the FIA or any team.
      </footer>
    </div>
  );
}
