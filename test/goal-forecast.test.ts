import { expect, test } from 'vitest';
import { AssemblyObservation, goalForecast } from '../src/goal-forecast.ts';
import { apply, exportRun, importRun, step } from '../src/sim.ts';
import { advanceForecastDay, forecastDay, storehouse } from './goal-forecast-scenario.ts';

// Causal control: actual gathered/delivered materials, HF-chosen construction and the storm check.
test('observed physical construction supports only a conditional forecast and preserves the complete world', () => {
  const run = forecastDay(),
    s = run.s,
    world = {},
    sampler = new AssemblyObservation();
  const initial = JSON.stringify(s);
  expect(goalForecast(s, null).join(' ')).toContain('100 more boards and 120 more ballast bags');
  expect(JSON.stringify(s)).toBe(initial);
  let held = false,
    estimated = false,
    shortageChanged = false;
  const raw: { tick: number; progress: number; report: string[] }[] = [];
  while (s.tick < 900) {
    advanceForecastDay(run);
    const before = JSON.stringify(s);
    sampler.observe(world, s);
    const report = goalForecast(s, sampler.pace(world, s));
    expect(JSON.stringify(s)).toBe(before); // includes all Persons, RNG, source, inputs and history
    if (!storehouse(s) && Object.values(s.settlement?.actors ?? {}).some((a) => a.carried)) {
      held = true;
      expect(report.join(' ')).toContain('still being carried');
    }
    if (!storehouse(s) && s.resources.stone > 0) shortageChanged = true;
    if (report.join(' ').includes('At the pace observed')) {
      estimated = true;
      const site = storehouse(s);
      if (!site) throw new Error('An estimate needs a real storehouse site.');
      expect(site.progress).toBeGreaterThan(0);
      expect(report.join(' ')).toContain('if people keep choosing assembly');
      raw.push({ tick: s.tick, progress: site.progress, report });
      if (raw.length === 1) {
        const twin = importRun(exportRun(s));
        expect(sampler.pace({}, twin)).toBe(null); // a new load has no observations
      }
    }
  }
  expect(held && shortageChanged && estimated).toBe(true);
  expect(raw.length).toBeGreaterThan(30);
  expect(s.settlement?.storm).toBe(true);
  expect(s.won).toBe(false);
  expect(storehouse(s)?.complete).toBe(false);
  expect(goalForecast(s, sampler.pace(world, s)).join(' ')).toContain('unfinished at 20:00');
  expect(goalForecast(s, sampler.pace(world, s)).join(' ')).not.toContain('At the pace observed');
  while (!storehouse(s)?.complete && s.tick < 1400) advanceForecastDay(run);
  expect(storehouse(s)?.complete).toBe(true);
  expect(s.won).toBe(false);
  expect(goalForecast(s, null).join(' ')).toContain('finished now, after the storm check');
  const baseline = importRun(exportRun(s)),
    observed = importRun(exportRun(s));
  const scoped = {},
    observer = new AssemblyObservation();
  for (let i = 0; i < 17; i++) {
    observer.observe(scoped, observed);
    goalForecast(observed, observer.pace(scoped, observed));
    step(observed);
    step(baseline);
  }
  expect(JSON.stringify(observed)).toBe(JSON.stringify(baseline));
  // The same real unfinished state supplies pause, skipped observation and replacement controls.
  const underway = forecastDay();
  while (underway.s.tick < 720) advanceForecastDay(underway);
  const o = new AssemblyObservation(),
    token = {};
  for (let i = 0; i < 61; i++) {
    o.observe(token, underway.s);
    step(underway.s);
  }
  o.observe(token, underway.s);
  expect(o.pace(token, underway.s)).not.toBe(null);
  const frozen = o.pace(token, underway.s);
  for (let i = 0; i < 100; i++) o.observe(token, underway.s);
  expect(o.pace(token, underway.s)).toEqual(frozen); // no ticks, no new time sample
  for (let i = 0; i < 10; i++) step(underway.s);
  o.observe(token, underway.s);
  expect(o.pace(token, underway.s)).toBe(null);
  apply(underway.s, { kind: 'settlement', ids: underway.s.villagers.map((v) => v.id), action: 'cancel' });
  expect(goalForecast(underway.s, frozen).join(' ')).toContain('Assembly is not underway now');
  for (let i = 0; i < 61; i++) {
    step(underway.s);
    o.observe(token, underway.s);
  }
  expect(o.pace(token, underway.s)).toBe(null);
  o.observe({}, underway.s);
  expect(o.pace(token, underway.s)).toBe(null);
});
