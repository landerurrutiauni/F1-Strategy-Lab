import { describe, expect, it } from 'vitest';
import { createRace } from '../game/engine';
import {
  ACTIVE_RACE_KEY,
  RECORDS_KEY,
  buildRaceRecord,
  clearRecords,
  computeStats,
  loadActiveRace,
  loadRecords,
  saveActiveRace,
  saveRaceRecord,
} from '../game/persistence';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from '../hooks/settingsStore';
import { BrokenStorage, MemoryStorage, baseConfig, runLaps, scriptedOneStop } from './helpers';

const finishedRace = () => runLaps(createRace(baseConfig({ laps: 10, seed: 99 })), 10, scriptedOneStop(5));

describe('race records', () => {
  it('saves a completed race and loads it back', () => {
    const storage = new MemoryStorage();
    const record = buildRaceRecord(finishedRace(), new Date('2026-10-14T12:00:00Z'));
    expect(saveRaceRecord(record, storage)).toEqual({ ok: true });
    const loaded = loadRecords(storage);
    expect(loaded.warning).toBeNull();
    expect(loaded.races).toHaveLength(1);
    expect(loaded.races[0]).toEqual(record);
    expect(loaded.races[0].driverName).toBe('Lando Norris');
    expect(loaded.races[0].circuitName).toBe('Bahrain Grand Prix');
  });

  it('keeps the newest records first and replaces duplicates', () => {
    const storage = new MemoryStorage();
    const race = finishedRace();
    const a = buildRaceRecord(race, new Date('2026-10-14T12:00:00Z'));
    const b = buildRaceRecord(race, new Date('2026-10-14T13:00:00Z'));
    saveRaceRecord(a, storage);
    saveRaceRecord(b, storage);
    saveRaceRecord(b, storage);
    expect(loadRecords(storage).races.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it('recovers from corrupted or outdated data without crashing', () => {
    const storage = new MemoryStorage();
    storage.setItem(RECORDS_KEY, '{not json');
    expect(loadRecords(storage)).toEqual({ races: [], warning: expect.stringContaining('unreadable') });

    storage.setItem(RECORDS_KEY, JSON.stringify({ version: 0, items: [] }));
    expect(loadRecords(storage).races).toEqual([]);

    const good = buildRaceRecord(finishedRace());
    storage.setItem(RECORDS_KEY, JSON.stringify({ version: 1, races: [good, { id: 'broken' }, 42] }));
    const loaded = loadRecords(storage);
    expect(loaded.races).toEqual([good]);
    expect(loaded.warning).toMatch(/2 saved races were unreadable/);
  });

  it('reports a failure instead of claiming success when storage fails', () => {
    const record = buildRaceRecord(finishedRace());
    expect(saveRaceRecord(record, new BrokenStorage())).toEqual({ ok: false, error: expect.any(String) });
    expect(saveRaceRecord(record, null)).toEqual({ ok: false, error: expect.any(String) });
    expect(loadRecords(new BrokenStorage()).races).toEqual([]);
  });

  it('refuses to build a record for an unfinished race', () => {
    expect(() => buildRaceRecord(createRace(baseConfig()))).toThrow();
  });

  it('clears records and computes career statistics', () => {
    const storage = new MemoryStorage();
    const record = buildRaceRecord(finishedRace());
    saveRaceRecord(record, storage);
    const stats = computeStats(loadRecords(storage).races);
    expect(stats.races).toBe(1);
    expect(stats.bestByCircuit.sepang).toBeDefined();
    expect(clearRecords(storage)).toEqual({ ok: true });
    expect(loadRecords(storage).races).toEqual([]);
  });
});

describe('race in progress', () => {
  it('saves after each lap and restores the exact state', () => {
    const storage = new MemoryStorage();
    const race = runLaps(createRace(baseConfig()), 3);
    const decision = { pace: 'push' as const, box: false, compound: 'hard' as const, boost: false };
    expect(saveActiveRace(race, decision, storage)).toBe(true);
    const restored = loadActiveRace(storage);
    expect(restored?.state).toEqual(race);
    expect(restored?.decision).toEqual(decision);
  });

  it('discards invalid saved races', () => {
    const storage = new MemoryStorage();
    storage.setItem(ACTIVE_RACE_KEY, JSON.stringify({ version: 1, state: { lap: 3 }, decision: {} }));
    expect(loadActiveRace(storage)).toBeNull();
    expect(storage.getItem(ACTIVE_RACE_KEY)).toBeNull();
    storage.setItem(ACTIVE_RACE_KEY, 'garbage');
    expect(loadActiveRace(storage)).toBeNull();
  });
});

describe('settings', () => {
  it('round-trips and falls back to defaults for bad values', () => {
    const storage = new MemoryStorage();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    saveSettings({ ...DEFAULT_SETTINGS, sound: true, motion: 'reduced' }, storage);
    expect(loadSettings(storage)).toMatchObject({ sound: true, motion: 'reduced' });
    storage.setItem(SETTINGS_KEY, JSON.stringify({ motion: 'sideways', sound: 'yes' }));
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.setItem(SETTINGS_KEY, '][');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, new BrokenStorage())).toBe(false);
  });
});
