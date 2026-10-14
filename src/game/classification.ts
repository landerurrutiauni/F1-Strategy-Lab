import { compoundRulePenalty } from './projection';
import type { CarState, ClassificationEntry, RaceState } from './types';

/**
 * Final classification.
 *
 * The winner is the car on the lead lap with the lowest race time (including penalties).
 * A car is classified on the lap it completes after the winner takes the flag, so a car
 * more than a lap down finishes with fewer laps. Retired cars are listed after
 * finishers, ordered by distance completed.
 */
export function classify(state: RaceState): ClassificationEntry[] {
  const total = state.totalLaps;
  const finishers = state.cars.filter((c) => c.status === 'running');
  const retired = state.cars.filter((c) => c.status === 'retired');

  for (const car of finishers) car.penaltyTime = compoundRulePenalty(car.usedCompounds, state.config.session);

  // Leader's raw time on the road decides when the flag falls.
  const flagTime = Math.min(...finishers.map((c) => c.elapsed));

  const lapsClassified = (car: CarState) => {
    const lapsBeforeFlag = car.laps.filter((l) => l.elapsed <= flagTime + 1e-9).length;
    return Math.min(total, lapsBeforeFlag + 1);
  };

  const finished = finishers.map((car) => {
    const laps = lapsClassified(car);
    const lapRecord = car.laps.find((l) => l.lap === laps);
    const raw = lapRecord ? lapRecord.elapsed : car.elapsed;
    return { car, laps, time: raw + car.penaltyTime };
  });
  finished.sort((a, b) => b.laps - a.laps || a.time - b.time);

  const winnerTime = finished.length > 0 ? finished[0].time : 0;
  const entries: ClassificationEntry[] = finished.map((f, i) => ({
    carId: f.car.id,
    position: i + 1,
    lapsCompleted: f.laps,
    totalTime: f.time,
    gapToWinner: f.laps === total ? f.time - winnerTime : null,
    lapsDown: total - f.laps,
    status: 'finished',
    penaltyTime: f.car.penaltyTime,
    pitStops: f.car.pitStops.length,
    bestLap: f.car.bestLapTime,
  }));

  retired
    .sort((a, b) => b.lapsCompleted - a.lapsCompleted || a.elapsed - b.elapsed)
    .forEach((car) => {
      entries.push({
        carId: car.id,
        position: entries.length + 1,
        lapsCompleted: car.lapsCompleted,
        totalTime: car.elapsed,
        gapToWinner: null,
        lapsDown: total - car.lapsCompleted,
        status: 'retired',
        penaltyTime: 0,
        pitStops: car.pitStops.length,
        bestLap: car.bestLapTime,
      });
    });

  for (const entry of entries) {
    const car = state.cars.find((c) => c.id === entry.carId);
    if (car) car.position = entry.position;
  }
  return entries;
}
