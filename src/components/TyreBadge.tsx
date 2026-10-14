import { memo } from 'react';
import { COMPOUNDS } from '../game/data/tyres';
import type { CompoundId } from '../game/types';

interface TyreBadgeProps {
  compound: CompoundId;
  size?: number;
  /** Wear 0..100; draws a remaining-life arc around the badge. */
  wear?: number;
  title?: string;
  className?: string;
}

/**
 * Tyre compound badge: coloured sidewall ring plus the compound letter, so the
 * compound is readable without relying on colour.
 */
export const TyreBadge = memo(function TyreBadge({ compound, size = 22, wear, title, className }: TyreBadgeProps) {
  const spec = COMPOUNDS[compound];
  const r = 10;
  const circumference = 2 * Math.PI * (r + 2.6);
  const life = wear === undefined ? null : Math.max(0, Math.min(1, 1 - wear / 100));
  const label = title ?? `${spec.name} tyre${wear !== undefined ? `, ${Math.round(wear)}% worn` : ''}`;
  return (
    <svg
      className={`tyre-badge${className ? ' ' + className : ''}`}
      width={size}
      height={size}
      viewBox="-14 -14 28 28"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <circle r={r} fill="var(--carbon-950)" stroke={spec.colorVar} strokeWidth={3.2} />
      {life !== null && (
        <circle
          r={r + 2.6}
          fill="none"
          stroke="var(--carbon-600)"
          strokeWidth={1.4}
        />
      )}
      {life !== null && (
        <circle
          r={r + 2.6}
          fill="none"
          stroke={life < 0.2 ? 'var(--red)' : 'var(--paper-dim)'}
          strokeWidth={1.4}
          strokeDasharray={`${circumference * life} ${circumference}`}
          transform="rotate(-90)"
        />
      )}
      <text
        y={0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--paper)"
        fontFamily="var(--font-display)"
        fontWeight={800}
        fontSize={11}
      >
        {spec.letter}
      </text>
    </svg>
  );
});
