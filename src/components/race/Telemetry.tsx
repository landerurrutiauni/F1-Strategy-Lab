import { Activity } from 'lucide-react';
import { useMemo } from 'react';
import { getDriver, getTeam } from '../../game/data/teams';
import type { RaceState } from '../../game/types';
import { LineChart, type ChartSeries } from '../LineChart';
import { Panel } from '../Panel';

interface TelemetryProps {
  race: RaceState;
  collapsible?: boolean;
  /** Compare against this car (defaults to the current leader / winner). */
  compareId?: string;
  /** The managed car to chart (the lead car by default). */
  carId?: string;
}

export function Telemetry({ race, collapsible, compareId, carId }: TelemetryProps) {
  const player = (carId && race.cars.find((c) => c.id === carId)) || race.cars.find((c) => c.driverId === race.config.playerDriverId) || race.cars.find((c) => c.isPlayer)!;
  const leader = race.cars.find((c) => c.id === compareId) ?? [...race.cars].sort((a, b) => a.position - b.position)[0];
  const scLaps = useMemo(() => race.lapStatus.map((s, i) => (s === 'sc' ? i : -1)).filter((i) => i > 0), [race.lapStatus]);
  const pitMarkers = player.pitStops.map((p) => ({ lap: p.lap, label: 'Pit' }));

  const lapSeries: ChartSeries[] = useMemo(() => {
    const values = (id: string) => {
      const car = race.cars.find((c) => c.id === id)!;
      const arr: Array<number | null> = [];
      for (const l of car.laps) arr[l.lap] = l.pitted || l.safetyCar || l.lap === 1 ? null : l.lapTime;
      return arr;
    };
    const series: ChartSeries[] = [
      { id: player.id, label: `${getDriver(player.driverId).code} (you)`, color: 'var(--lime)', values: values(player.id), emphasis: true },
    ];
    if (leader && leader.id !== player.id) {
      series.push({ id: leader.id, label: getDriver(leader.driverId).code, color: getTeam(leader.teamId).color, values: values(leader.id), dashed: true });
    }
    return series;
  }, [race.cars, player, leader]);

  const wearSeries: ChartSeries[] = useMemo(() => {
    const arr: Array<number | null> = [];
    for (const l of player.laps) arr[l.lap] = l.wear;
    return [{ id: 'wear', label: 'Tyre wear at lap end', color: 'var(--amber)', values: arr, emphasis: true }];
  }, [player.laps]);

  return (
    <Panel title="Telemetry" icon={<Activity size={16} />} className="telemetry" collapsible={collapsible}>
      {race.lap < 2 ? (
        <p className="muted">Lap-time and wear traces appear after the first two laps.</p>
      ) : (
        <div className="telemetry__charts">
          <LineChart
            label="Lap times (green-flag laps, pit and Safety Car laps hidden)"
            series={lapSeries}
            maxLap={race.totalLaps}
            formatY={(v) => v.toFixed(1)}
            shadedLaps={scLaps}
            markers={pitMarkers}
          />
          <LineChart
            label="Tyre wear"
            series={wearSeries}
            maxLap={race.totalLaps}
            yMin={0}
            yMax={100}
            formatY={(v) => `${Math.round(v)}%`}
            shadedLaps={scLaps}
            markers={pitMarkers}
          />
        </div>
      )}
    </Panel>
  );
}
