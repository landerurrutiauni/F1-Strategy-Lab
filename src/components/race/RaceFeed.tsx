import { memo } from 'react';
import {
  ArrowUpDown,
  CircleAlert,
  CloudRain,
  Flag,
  Info,
  List,
  Radio,
  Siren,
  Thermometer,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import type { RaceEvent, RaceEventKind } from '../../game/types';
import { Panel } from '../Panel';

const ICONS: Record<RaceEventKind, typeof Info> = {
  start: Flag,
  weather: CloudRain,
  'safety-car': TriangleAlert,
  pit: Wrench,
  incident: Siren,
  overtake: ArrowUpDown,
  tyre: CircleAlert,
  track: Thermometer,
  finish: Flag,
  info: Info,
};

interface RaceFeedProps {
  events: RaceEvent[];
  engineer: string;
  currentLap: number;
  collapsible?: boolean;
  limit?: number;
}

export const RaceFeed = memo(function RaceFeed({ events, engineer, currentLap, collapsible, limit = 40 }: RaceFeedProps) {
  const list = [...events].reverse().slice(0, limit);
  return (
    <Panel title="Race control and radio" icon={<List size={16} />} className="feed" collapsible={collapsible}>
      <ol className="feed__list">
        {list.map((event) => {
          const Icon = ICONS[event.kind];
          return (
            <li key={event.id} className={`feed__item sev-${event.severity}${event.lap === currentLap ? ' is-new' : ''}`}>
              <span className="feed__icon" aria-hidden="true">
                <Icon size={15} />
              </span>
              <span className="feed__lap">{event.lap === 0 ? 'Start' : `L${event.lap}`}</span>
              <div className="feed__body">
                <p className="feed__title">{event.title}</p>
                <p className="feed__detail">{event.detail}</p>
                {event.radio && (
                  <div className="feed__radio">
                    <p className="feed__radio-head">
                      <Radio size={13} aria-hidden="true" />
                      {engineer}, team radio
                    </p>
                    <p>“{event.radio}”</p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
});
