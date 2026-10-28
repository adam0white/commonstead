import { expect, test } from 'vitest';
import { AssemblyObservation, goalForecast } from '../src/goal-forecast.ts';
import { apply, step } from '../src/sim.ts';
import { advanceForecastDay, forecastDay, storehouse } from './goal-forecast-scenario.ts';

// Real collection, delivery and HF-chosen assembly supply this control. No Person or RNG edits.
test('observed physical construction supports a conditional forecast without changing the world', async () => {
  const run = forecastDay(),
    s = run.s,
    world = {},
    sampler = new AssemblyObservation();
  const initial = JSON.stringify(s);
  expect(goalForecast(s, null).join(' ')).toContain('100 more boards and 120 more ballast bags');
  expect(JSON.stringify(s)).toBe(initial);
  let held = false,
    delivered = false,
    spent = false,
    estimated = false;
  for (let n = 0; n < 899 && !estimated; n++) {
    const prior = { ...s.resources },
      hadSite = !!storehouse(s);
    advanceForecastDay(run);
    sampler.observe(world, s);
    const report = goalForecast(s, sampler.pace(world, s)).join(' ');
    if (!storehouse(s) && Object.values(s.settlement?.actors ?? {}).some((a) => a.carried)) {
      held = true;
      expect(report).toContain('still being carried');
    }
    if (!storehouse(s) && s.resources.stone > 0) delivered = true;
    if (!hadSite && storehouse(s)) {
      expect(s.resources.wood).toBeCloseTo(prior.wood - 180);
      expect(s.resources.stone).toBeCloseTo(prior.stone - 120);
      spent = true;
    }
    if (report.includes('At the pace observed')) {
      estimated = true;
      expect(storehouse(s)?.progress).toBeGreaterThan(0);
      expect(storehouse(s)?.complete).toBe(false);
      expect(report).toContain('if people keep choosing assembly');
      expect(report).toContain('does not predict choices, breaks or future travel');
    }
    if (n % 100 === 0)
      console.info(
        `Forecast control: tick ${s.tick}, boards ${s.resources.wood}, bags ${s.resources.stone}, assembly ${storehouse(s)?.progress ?? 'no site'}`,
      );
    if (n % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(
    { held, delivered, spent, estimated },
    JSON.stringify({
      tick: s.tick,
      resources: s.resources,
      site: storehouse(s),
    }),
  ).toEqual({
    held: true,
    delivered: true,
    spent: true,
    estimated: true,
  });
  // Full-state snapshots include every Person, RNG, source, input and history. Repeated
  // renders at one tick supply no time or work and leave all of those values intact.
  const before = JSON.stringify(s),
    frozen = sampler.pace(world, s);
  for (let i = 0; i < 100; i++) {
    sampler.observe(world, s);
    goalForecast(s, sampler.pace(world, s));
  }
  expect(sampler.pace(world, s)).toEqual(frozen);
  expect(JSON.stringify(s)).toBe(before);
  // A replacement world has no UI-owned observations. Whole-state deterministic
  // replay and continuation are covered by pressure and HF4 protocol controls.
  expect(sampler.pace({}, s)).toBe(null);
  // A skipped observation invalidates the window, and a cancelled actual job cannot
  // use an earlier pace as a forecast of current assembly.
  for (let i = 0; i < 10; i++) step(s);
  sampler.observe(world, s);
  expect(sampler.pace(world, s)).toBe(null);
  apply(s, { kind: 'settlement', ids: s.villagers.map((v) => v.id), action: 'cancel' });
  expect(goalForecast(s, frozen).join(' ')).toContain('Assembly is not underway now');
  for (let i = 0; i < 31; i++) {
    step(s);
    sampler.observe(world, s);
  }
  expect(sampler.pace(world, s)).toBe(null);
  sampler.observe({}, s);
  expect(sampler.pace(world, s)).toBe(null);
  // Reach the real storm with the physical site still unfinished. An old estimate
  // cannot replace that observed result or turn later work into an earlier win.
  for (let n = 0; s.tick < 900 && n < 900; n++) {
    const prior = s.tick;
    step(s);
    if (s.tick <= prior) throw new Error(`Forecast storm control stopped at tick ${s.tick}.`);
    if (n % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(s.settlement?.storm).toBe(true);
  expect(s.won).toBe(false);
  expect(storehouse(s)?.complete).toBe(false);
  expect(goalForecast(s, frozen).join(' ')).toContain('unfinished at 20:00');
  expect(goalForecast(s, frozen).join(' ')).not.toContain('At the pace observed');
}, 120_000);
