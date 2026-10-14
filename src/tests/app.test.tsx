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
    expect(screen.getByLabelText('Race seed')).toHaveValue('4242');
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

describe('season mode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  /** Clicks the button for the next qualifying segment, or finishes the session after a knock-out. */
  async function runQualifying(user: ReturnType<typeof userEvent.setup>) {
    for (let i = 0; i < 3; i++) {
      const finish = screen.queryByRole('button', { name: 'Finish the session' });
      if (finish) {
        await user.click(finish);
        return;
      }
      const run = screen.queryByRole('button', { name: /^Run S?Q[123]$/ });
      if (!run) return;
      await user.click(run);
    }
  }

  it('runs testing, a full race weekend and keeps the championship', async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(screen.getByRole('button', { name: /2026 season/ }));
    expect(screen.getByRole('heading', { name: 'New season' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Your driver'), 'alb');
    await user.click(screen.getByRole('button', { name: 'Start the season' }));

    // Pre-season testing in Bahrain.
    expect(screen.getByRole('heading', { name: 'Pre-season testing' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Reliability mileage/ }));
    await user.click(screen.getByRole('button', { name: 'Run day 1' }));
    expect(screen.getByText(/Reliability mileage: reliability 0% →/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Test 1 day 1 timesheet/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skip the rest of testing' }));

    // Round 1: three practice sessions, qualifying and the Grand Prix.
    expect(screen.getByRole('heading', { name: 'Australian Grand Prix' })).toBeInTheDocument();
    for (const fp of ['FP1', 'FP2', 'FP3']) await user.click(screen.getByRole('button', { name: `Run ${fp}` }));
    expect(screen.getByRole('table', { name: 'Practice 3 classification' })).toBeInTheDocument();
    await runQualifying(user);
    expect(screen.getByRole('heading', { name: /Grand Prix: 15 laps/ })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Qualifying result' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Let the strategist run it/ }));

    // Round 2 is a Sprint weekend.
    expect(screen.getByRole('heading', { name: /Round 1: Australian Grand Prix/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chinese Grand Prix' })).toBeInTheDocument();
    expect(screen.getAllByText('Sprint weekend').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Run FP1' }));
    expect(screen.getByRole('heading', { name: /Sprint Qualifying: SQ1/ })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    expect(screen.getByRole('table', { name: 'Drivers’ championship' })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Drivers’ championship' })).getAllByRole('row')).toHaveLength(23);

    // The season survives a reload.
    first.unmount();
    renderApp();
    await user.click(screen.getByRole('button', { name: /Continue 2026 season/ }));
    expect(screen.getByRole('heading', { name: /Sprint Qualifying: SQ1/ })).toBeInTheDocument();
  }, 60_000);
});
