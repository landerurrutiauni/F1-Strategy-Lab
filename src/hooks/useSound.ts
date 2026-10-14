import { useCallback, useRef } from 'react';
import { useSettings } from './useSettings';

export type SoundCue = 'lap' | 'pit' | 'alert' | 'finish' | 'select';

interface Tone {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

const CUES: Record<SoundCue, Tone[]> = {
  select: [{ freq: 880, start: 0, duration: 0.05, type: 'square', gain: 0.03 }],
  lap: [
    { freq: 520, start: 0, duration: 0.08, type: 'triangle', gain: 0.08 },
    { freq: 780, start: 0.07, duration: 0.1, type: 'triangle', gain: 0.07 },
  ],
  pit: [
    { freq: 300, start: 0, duration: 0.12, type: 'sawtooth', gain: 0.04 },
    { freq: 450, start: 0.13, duration: 0.12, type: 'sawtooth', gain: 0.04 },
    { freq: 600, start: 0.26, duration: 0.14, type: 'sawtooth', gain: 0.04 },
  ],
  alert: [
    { freq: 660, start: 0, duration: 0.18, type: 'square', gain: 0.045 },
    { freq: 660, start: 0.26, duration: 0.18, type: 'square', gain: 0.045 },
  ],
  finish: [
    { freq: 523, start: 0, duration: 0.16, type: 'triangle', gain: 0.08 },
    { freq: 659, start: 0.15, duration: 0.16, type: 'triangle', gain: 0.08 },
    { freq: 784, start: 0.3, duration: 0.32, type: 'triangle', gain: 0.08 },
  ],
};

/**
 * Small synthesised sound cues via the Web Audio API (no audio files).
 * Muted unless the player switches sound on in Settings.
 */
export function useSound() {
  const { settings } = useSettings();
  const ctxRef = useRef<AudioContext | null>(null);

  return useCallback(
    (cue: SoundCue, force = false) => {
      if (!settings.sound && !force) return;
      try {
        const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        if (!ctxRef.current) ctxRef.current = new AudioCtor();
        const ctx = ctxRef.current;
        if (ctx.state === 'suspended') void ctx.resume();
        const now = ctx.currentTime;
        for (const tone of CUES[cue]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = tone.type ?? 'sine';
          osc.frequency.value = tone.freq;
          const peak = tone.gain ?? 0.06;
          gain.gain.setValueAtTime(0.0001, now + tone.start);
          gain.gain.exponentialRampToValueAtTime(peak, now + tone.start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.duration);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now + tone.start);
          osc.stop(now + tone.start + tone.duration + 0.02);
        }
      } catch {
        /* Audio is optional: ignore failures. */
      }
    },
    [settings.sound],
  );
}
