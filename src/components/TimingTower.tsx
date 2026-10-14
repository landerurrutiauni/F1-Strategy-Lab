import { memo, useLayoutEffect, useRef } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { TowerRow } from '../game/view';
import { TyreBadge } from './TyreBadge';

interface TimingTowerProps {
  rows: TowerRow[];
  gapMode: 'interval' | 'leader';
  lapKey: number;
  reducedMotion: boolean;
  onToggleGapMode?: () => void;
  compact?: boolean;
}

function gapText(row: TowerRow, mode: 'interval' | 'leader'): string {
  if (row.retired) return 'Out';
  if (row.position === 1) return 'Leader';
  if (row.lapsDown > 0) return `+${row.lapsDown} lap${row.lapsDown > 1 ? 's' : ''}`;
  const value = mode === 'interval' ? row.interval : row.gap;
  return value === null ? '–' : `+${value.toFixed(value >= 100 ? 0 : 1)}`;
}

/**
 * Live classification. Rows slide to their new places after each lap (FLIP animation),
 * skipped when reduced motion is on.
 */
export const TimingTower = memo(function TimingTower({ rows, gapMode, lapKey, reducedMotion, onToggleGapMode, compact }: TimingTowerProps) {
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const lastTops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const nextTops = new Map<string, number>();
    rowRefs.current.forEach((el, id) => nextTops.set(id, el.offsetTop));
    if (!reducedMotion && lastTops.current.size > 0) {
      rowRefs.current.forEach((el, id) => {
        const prev = lastTops.current.get(id);
        const next = nextTops.get(id);
        if (prev === undefined || next === undefined || prev === next) return;
        el.style.transition = 'none';
        el.style.transform = `translateY(${prev - next}px)`;
        void el.offsetHeight;
        el.style.transition = 'transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.transform = '';
      });
    }
    lastTops.current = nextTops;
  }, [lapKey, reducedMotion]);

  return (
    <div className={`tower${compact ? ' tower--compact' : ''}`}>
      <div className="tower__head">
        <span>Pos</span>
        <span>Driver</span>
        <span>Tyre</span>
        <span className="tower__gap-head">
          {onToggleGapMode ? (
            <button type="button" className="link-button" onClick={onToggleGapMode} title="Switch between interval and gap to leader">
              {gapMode === 'interval' ? 'Interval' : 'To leader'}
            </button>
          ) : gapMode === 'interval' ? (
            'Interval'
          ) : (
            'To leader'
          )}
        </span>
      </div>
      <ol className="tower__list" aria-label="Timing tower">
        {rows.map((row) => {
          const status = row.retired ? 'Retired' : row.pittedLastLap ? 'Pitted' : null;
          return (
            <li
              key={row.car.id}
              ref={(el) => {
                if (el) rowRefs.current.set(row.car.id, el);
                else rowRefs.current.delete(row.car.id);
              }}
              className={`tower__row${row.car.isPlayer ? ' is-player' : ''}${row.retired ? ' is-retired' : ''}`}
              aria-label={`P${row.position} ${row.name}, ${row.teamName}${row.car.isPlayer ? ' (your car)' : ''}, ${gapText(row, gapMode)}${status ? `, ${status}` : ''}`}
            >
              <span className="tower__pos">{row.retired ? '–' : row.position}</span>
              <span className="tower__team" style={{ background: row.color }} aria-hidden="true" />
              <span className="tower__driver" title={`${row.name}, ${row.teamName}`}>
                <span className="tower__code">{row.code}</span>
                {row.change !== 0 && (
                  <span className={`tower__change ${row.change > 0 ? 'is-up' : 'is-down'}`} aria-hidden="true">
                    {row.change > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                    {Math.abs(row.change)}
                  </span>
                )}
              </span>
              <span className="tower__tyre">
                {!row.retired && <TyreBadge compound={row.car.tyre.compound} size={18} />}
                {!row.retired && <span className="tower__age">{row.car.tyre.age}</span>}
              </span>
              <span className="tower__gap">
                {status === 'Pitted' && <span className="tower__flag tower__flag--pit">Pit</span>}
                {gapText(row, gapMode)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
});
