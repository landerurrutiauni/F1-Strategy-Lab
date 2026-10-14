import { Cloud, CloudDrizzle, CloudLightning, CloudRain, Sun } from 'lucide-react';
import { weatherIconKind } from '../game/weather';

interface WeatherIconProps {
  rain: number;
  wetness: number;
  size?: number;
}

export function WeatherIcon({ rain, wetness, size = 18 }: WeatherIconProps) {
  const kind = weatherIconKind(rain, wetness);
  const props = { size, 'aria-hidden': true as const, strokeWidth: 2 };
  switch (kind) {
    case 'storm':
      return <CloudLightning {...props} />;
    case 'rain':
      return <CloudRain {...props} />;
    case 'drizzle':
      return <CloudDrizzle {...props} />;
    case 'cloud':
      return <Cloud {...props} />;
    default:
      return <Sun {...props} />;
  }
}
