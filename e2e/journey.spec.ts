import { expect, test, type Page } from '@playwright/test';

/** Fails the test on any console error or failed request. */
function watchForErrors(page: Page) {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`requestfailed: ${req.url()}`));
  return problems;
}

/** Jumps to the leader's next crossing of the line (the race otherwise runs on its own). */
async function advance(page: Page) {
  await page.getByRole('button', { name: 'Next lap' }).click();
}

/** Steps lap by lap until the chequered flag (full Grand Prix distances). */
async function runToFlag(page: Page) {
  const seeResults = page.getByRole('button', { name: 'See results' });
  for (let i = 0; i < 90 && !(await seeResults.isVisible()); i++) await advance(page);
  await expect(seeResults).toBeVisible();
}

test('full race journey with a Safety Car, a pit stop and saved records', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('./?seed=2468');
  await expect(page.getByRole('heading', { level: 1, name: /F1 Strategy Lab/i })).toBeVisible();

  // Briefing: circuit, team (both cars), distance, weather, tyres and the Safety Car drill.
  await page.getByRole('button', { name: 'New race' }).click();
  await expect(page.getByRole('heading', { name: 'Race briefing' })).toBeVisible();
  await page.locator('label.circuit-card', { hasText: 'Monza' }).click();
  await expect(page.getByRole('heading', { name: 'Italian Grand Prix' })).toBeVisible();
  await page.getByLabel('Your team').selectOption('redbull');
  await expect(page.getByText(/race engineer: Gianpiero Lambiase/)).toBeVisible();
  await expect(page.getByText('53 laps, 307.0 km')).toBeVisible();
  await page.locator('label.segmented__option', { hasText: 'Variable' }).click();
  await page.locator('label.compound', { hasText: 'Soft' }).first().click();
  await page.getByText('Seed and event drills').click();
  await page.getByLabel('Event drill').selectOption('safety-car-early');
  await page.getByRole('button', { name: 'Start race' }).click();

  await expect(page.getByText('Italian Grand Prix')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lap 1 call' })).toBeVisible();

  // Change pace with the keyboard and run two laps.
  await page.keyboard.press('3');
  await expect(page.getByRole('radio', { name: /^Push/ })).toBeChecked();
  await advance(page);
  await advance(page);
  await advance(page);

  // The drill deploys a Safety Car after lap 3.
  await expect(page.locator('.status-chip--sc')).toContainText('Safety Car');
  await expect(page.locator('.feed__title', { hasText: 'Safety Car deployed' }).first()).toBeVisible();

  // Pit under the Safety Car for hards and check the tyre change.
  await page.locator('label.segmented__option', { hasText: 'End of lap' }).click();
  await page.locator('label.compound', { hasText: 'Hard' }).click();
  await advance(page);
  await expect(page.locator('.tyres__compound')).toContainText('Hard');
  await expect(page.locator('.feed__title', { hasText: 'Box, box VER: Soft to Hard' })).toBeVisible();

  // The second car has its own call: switch to it with the keyboard.
  await page.keyboard.press('c');
  await expect(page.getByRole('tab', { name: /HAD/ })).toHaveAttribute('aria-selected', 'true');
  // Run to the flag over Monza's full 53 laps, a line crossing at a time.
  await runToFlag(page);
  await expect(page.getByText(/Result saved to your records/)).toBeVisible();
  await page.screenshot({ path: 'test-results/race-finished.png' });
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page.getByRole('heading', { name: /Italian Grand Prix result/ })).toBeVisible();
  await expect(page.getByText('Saved to your records.')).toBeVisible();
  await expect(page.locator('table.table')).toContainText('Max Verstappen');
  await page.getByRole('button', { name: 'Inspect race summary' }).click();
  await expect(page.getByRole('heading', { name: 'Race summary' })).toBeVisible();
  await page.screenshot({ path: 'test-results/results.png', fullPage: true });

  // Records persist across a reload.
  await page.reload();
  await page.getByRole('button', { name: /Records/ }).click();
  await expect(page.getByRole('table')).toContainText('Italian Grand Prix');
  await expect(page.getByRole('table')).toContainText('Max Verstappen');

  expect(problems).toEqual([]);
});

test('weather drill: rain arrives and the radar and projections react', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('./?seed=777&circuit=spa&weather=variable&scenario=storm&tyre=medium');
  await page.getByRole('button', { name: 'New race' }).click();
  await page.getByRole('button', { name: 'Start race' }).click();
  // The storm arrives about a third of the way into Spa's 44 laps.
  const rain = page.locator('.feed__title', { hasText: /starts to fall|getting heavier|conditions changing/ }).first();
  for (let i = 0; i < 20 && !(await rain.isVisible()); i++) await advance(page);
  await expect(rain).toBeVisible();
  await advance(page);
  await advance(page);
  await expect(page.locator('.weather-chip')).toContainText(/rain/i);
  await page.screenshot({ path: 'test-results/weather-drill.png' });
  // Unless the car has already pitted for treaded tyres, the tyre panel warns about slicks in the wet.
  const onSlicks = await page.locator('.tyres__compound').textContent();
  if (onSlicks && /Soft|Medium|Hard/.test(onSlicks)) await expect(page.locator('.facts__warn')).toContainText('Wrong tyre');
  expect(problems).toEqual([]);
});

test('the same seed from a shared link replays the same race', async ({ page }) => {
  const run = async () => {
    await page.goto('./?seed=4321&circuit=suzuka');
    await page.getByRole('button', { name: 'New race' }).click();
    await expect(page.getByLabel('Race seed')).toHaveValue('4321');
    await page.getByRole('button', { name: 'Start race' }).click();
    for (let i = 0; i < 4; i++) await advance(page);
    return page.getByRole('list', { name: 'Timing tower' }).locator('li').evaluateAll((items) => items.map((li) => li.getAttribute('aria-label')));
  };
  const first = await run();
  const second = await run();
  expect(first).toHaveLength(22);
  expect(second).toEqual(first);
});

test('live race: lights out, cars lap the circuit on their own and the Safety Car pauses the race', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('./?seed=2468&circuit=monza&scenario=safety-car-early');
  await page.getByRole('button', { name: 'New race' }).click();
  await page.getByRole('button', { name: 'Start race' }).click();
  await page.getByRole('radio', { name: 'Speed 64 times' }).check({ force: true });
  await page.getByRole('button', { name: 'Lights out' }).click();
  await expect(page.getByRole('img', { name: /red lights on/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 8000 });

  // The cars move continuously between lap boundaries.
  const firstCar = page.locator('.circuit-map__car').first();
  const before = await firstCar.getAttribute('transform');
  await page.waitForTimeout(400);
  expect(await firstCar.getAttribute('transform')).not.toBe(before);

  // Laps go by without pressing anything, until the Safety Car pauses the race for a call.
  await expect(page.locator('.transport__paused')).toContainText('Safety Car deployed', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(page.locator('.race-header__lap')).toHaveAttribute('aria-label', 'Lap 4 of 53');
  await page.screenshot({ path: 'test-results/live-race.png' });

  // Resume for a while at 64× (a lap every second or so), then step to the flag.
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.race-header__lap')).not.toHaveAttribute('aria-label', 'Lap 4 of 53', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  await runToFlag(page);
  expect(problems).toEqual([]);
});

test('layouts fit phone and desktop widths without horizontal scrolling', async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('./?seed=1357');
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'New race' }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Start race' }).click();
    await advance(page);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/race-${viewport.width}.png` });
  }
});

test('reduced motion setting is applied', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.locator('label.segmented__option', { hasText: 'Reduced' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
});

test('season: testing, a weekend and a live Grand Prix that counts for the championship', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /2026 season/ }).click();
  await page.getByLabel('Your driver').selectOption('lec');
  await page.locator('summary', { hasText: 'Season seed' }).click();
  await page.getByLabel('Season seed').fill('31337');
  await page.getByRole('button', { name: 'Start the season' }).click();

  await expect(page.getByRole('heading', { name: 'Pre-season testing' })).toBeVisible();
  await page.getByRole('button', { name: 'Run day 1' }).click();
  await page.getByRole('button', { name: 'Skip the rest of testing' }).click();

  await expect(page.getByRole('heading', { name: 'Australian Grand Prix' })).toBeVisible();
  for (const fp of ['FP1', 'FP2', 'FP3']) await page.getByRole('button', { name: `Run ${fp}` }).click();
  for (let i = 0; i < 3; i++) {
    const finish = page.getByRole('button', { name: 'Finish the session' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await page.getByRole('button', { name: /^Run Q[123]$/ }).click();
  }
  await expect(page.getByRole('heading', { name: /Grand Prix: 58 laps/ })).toBeVisible();
  await page.getByRole('button', { name: 'Go to the pit wall' }).click();

  await expect(page.getByRole('heading', { name: 'Lap 1 call' })).toBeVisible();
  await runToFlag(page);
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page.getByRole('heading', { name: 'Australian Grand Prix result' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue season' }).click();

  await expect(page.getByRole('heading', { name: /Round 1: Australian Grand Prix/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chinese Grand Prix' })).toBeVisible();
  await expect(page.getByText('Rounds').locator('..')).toContainText('1/23');
  await page.screenshot({ path: 'test-results/season-round2.png', fullPage: true });
  expect(problems).toEqual([]);
});
