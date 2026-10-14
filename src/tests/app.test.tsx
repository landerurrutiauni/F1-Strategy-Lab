import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { TimingTower } from '../components/TimingTower';
import { createRace } from '../game/engine';
import { RECORDS_KEY } from '../game/persistence';
import { towerRows } from '../game/view';
import { SettingsProvider } from '../hooks/settings';
import { baseConfig } from './helpers';

const renderApp = () =>
  render(
    <SettingsProvider>
      <App />
    </SettingsProvider>,
  );

describe('game flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/?seed=4242&circuit=sepang&laps=10');
  });

  it('goes from the menu to the briefing and starts a race', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: /F1 Strategy Lab/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New race' }));
    expect(screen.getByRole('heading', { name: /Race briefing/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /Bahrain/ }).length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText('Your driver'), 'lec');
    expect(screen.getByText(/Race engineer: Bryan Bozzi/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start race' }));
    expect(screen.getByRole('heading', { name: /Lap 1 call/i })).toBeInTheDocument();
    expect(screen.getByText('Bahrain Grand Prix')).toBeInTheDocument();
  });

  it('advances laps, boxes for new tyres and finishes with a saved result', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'New race' }));
    await user.click(screen.getByRole('button', { name: 'Start race' }));

    await user.click(screen.getByRole('button', { name: /Advance lap/ }));
    expect(screen.getByRole('heading', { name: /Lap 2 call/i })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Box this lap' }));
    await user.click(screen.getByRole('radio', { name: /^Hard tyre/ }));
    await user.click(screen.getByRole('button', { name: /then box for Hard/ }));
    expect(screen.getAllByText(/Box, box: Medium to Hard/).length).toBeGreaterThan(0);

    for (let lap = 3; lap <= 10; lap++) {
      const button = screen.queryByRole('button', { name: /Advance lap|Run final lap/ });
      if (!button) break;
      await user.click(button);
    }
    expect(screen.getAllByText(/Chequered flag/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Result saved to your records/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See results' }));
    expect(screen.getByRole('heading', { name: /Bahrain Grand Prix result/ })).toBeInTheDocument();
    expect(screen.getByText('Saved to your records.')).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(RECORDS_KEY)!);
    expect(stored.races).toHaveLength(1);
  });

  it('supports keyboard shortcuts on the race screen', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'New race' }));
    await user.click(screen.getByRole('button', { name: 'Start race' }));
    await user.keyboard('3');
    expect(screen.getByRole('radio', { name: /Push/ })).toBeChecked();
    await act(async () => {
      await user.keyboard('n');
    });
    expect(screen.getByRole('heading', { name: /Lap 2 call/i })).toBeInTheDocument();
  });

  it('resumes a race in progress from the menu', async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(screen.getByRole('button', { name: 'New race' }));
    await user.click(screen.getByRole('button', { name: 'Start race' }));
    await user.click(screen.getByRole('button', { name: /Advance lap/ }));
    first.unmount();
    renderApp();
    await user.click(screen.getByRole('button', { name: /Resume race/ }));
    expect(screen.getByRole('heading', { name: /Lap 2 call/i })).toBeInTheDocument();
  });

  it('opens the information screens', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: /How to play/ }));
    expect(screen.getByRole('heading', { name: 'Tyres' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('button', { name: /Records/ }));
    expect(screen.getByText('No races yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('button', { name: /Settings/ }));
    await user.click(screen.getByRole('switch', { name: /Sound effects/ }));
    expect(screen.getByRole('switch', { name: /Sound effects/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('button', { name: /About/ }));
    expect(screen.getByText(/not affiliated with/)).toBeInTheDocument();
  });
});

describe('timing tower', () => {
  it('lists every car with the player highlighted', () => {
    const race = createRace(baseConfig());
    render(<TimingTower rows={towerRows(race)} gapMode="interval" lapKey={0} reducedMotion />);
    const list = screen.getByRole('list', { name: 'Timing tower' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(22);
    expect(within(list).getByLabelText(/Lando Norris, McLaren \(your car\)/)).toBeInTheDocument();
  });
});
