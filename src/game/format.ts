/** Display formatting helpers shared by the UI. */

/** 84.123 -> "1:24.123" */
export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '–';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

/** 1287.4 -> "21:27.4" */
export function formatRaceTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '–';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = s.toFixed(1).padStart(4, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Signed delta: +1.2 s / −0.8 s */
export function formatDelta(seconds: number, digits = 1): string {
  if (!Number.isFinite(seconds)) return '–';
  const rounded = Number(seconds.toFixed(digits));
  if (rounded === 0) return `±${(0).toFixed(digits)} s`;
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(digits)} s`;
}

export function formatGap(seconds: number | null, digits = 1): string {
  if (seconds === null || !Number.isFinite(seconds)) return '–';
  return `+${seconds.toFixed(digits)}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function pct(value: number): string {
  return `${Math.round(value)}%`;
}
