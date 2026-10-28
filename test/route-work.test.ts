import { expect, test } from 'vitest';
import { apply, createGame, exportRun, importRun, step } from '../src/sim.ts';
import { WorkObservation } from '../src/work-observation.ts';

// Headless causal control. A wrong projection that treats a pending yield as completed,
// blocks returning loads, or calls Dai/Nora the recurring Sam/Nora dispute must fail.
test('route and work readings follow actual requests, choices, loads and distinct pairs', () => {
  const s = createGame(418, undefined, { edition: 'settlement-day/1' });
  const view = new WorkObservation();
  const nora = s.villagers[0],
    sam = s.villagers[1],
    dai = s.villagers[2];
  const w = s.settlement,
    noraWork = w?.actors.v1;
  if (!nora || !sam || !dai || !w || !noraWork) throw new Error('Missing control residents');
  const read = (v = sam) => {
    const before = JSON.stringify(s);
    const text = view.summary(s, v);
    expect(JSON.stringify(s)).toBe(before);
    return text;
  };
  for (const [i, v] of s.villagers.slice(0, 4).entries())
    apply(s, { kind: 'order', ids: [v.id], target: i < 2 ? 'wood' : 'stone' });
  expect(read()).toContain('next action choice');
  while (s.tick < 17) step(s);
  expect(w.dispute).toEqual(['v2', 'v1']);
  expect(read()).toContain('Sam and Nora');
  expect(read()).toContain('waits for this dispute to be resolved');
  expect(read()).toContain('Nora holds the shared trolley');
  expect(read()).toContain('08:13');
  expect(read()).toContain('personal activity');
  expect(read()).toContain('Supplies remaining at the collection point are unknown');
  // An actually rejected request leaves Nora's work untouched. Do not call it queued.
  const job = structuredClone(noraWork.job);
  apply(s, { kind: 'settlement', ids: ['v1'], action: 'yield' });
  expect(noraWork.job).toEqual(job);
  expect(s.message).toContain('finish the current act');
  expect(read(nora)).not.toContain('Yield is underway');
  apply(s, { kind: 'settlement', ids: ['v2'], action: 'yield' });
  expect(read()).toContain('Yield has not begun');
  expect(w.routeAgreements).toEqual([]);
  while (s.tick < 26) step(s);
  const held = noraWork.carried;
  if (!held) throw new Error('Expected actual collected load');
  const load = held.amount;
  const stock = s.resources.wood;
  expect(read(nora)).toContain('Delivery is unfinished');
  expect(read(nora)).not.toContain('gathering waits');
  const stranded = importRun(exportRun(s));
  apply(stranded, { kind: 'settlement', ids: ['v1'], action: 'cancel' });
  const carrier = stranded.villagers[0];
  if (!carrier) throw new Error('Missing carrier');
  expect(view.summary(stranded, carrier)).toContain('No return trip is requested');
  expect(stranded.resources.wood).toBe(stock);
  expect(stranded.settlement?.actors.v1?.carried?.amount).toBe(load);
  apply(stranded, { kind: 'pause-chapter' });
  while (!stranded.chapterPaused && stranded.tick < 200) step(stranded);
  expect(stranded.chapterPaused).toBe(true);
  expect(view.summary(stranded, carrier)).toContain('The chapter is paused');
  expect(read(nora)).toContain('Earlier collection point: Workshop yard');

  while (s.tick < 48) step(s);
  expect(s.resources.wood).toBeCloseTo(stock + load);
  expect(read()).toContain('Yield is underway');
  expect(w.routeAgreements).toEqual([]);
  while (s.tick < 56) step(s);
  expect(w.routeAgreements).toEqual(['v1/v2']);
  expect(w.dispute).toBe(null);
  expect(read()).toContain('No work request is retained');
  expect(read()).toContain('08:44');
  apply(s, { kind: 'order', ids: ['v2'], target: 'wood' });
  while (s.tick < 62) step(s);
  expect(w.dispute).toEqual(['v3', 'v1']);
  expect(read(dai)).toContain('Dai and Nora');
  expect(read(dai)).toContain('Nora and Sam');
  expect(read(dai)).toContain('different pair');
  expect(read(dai)).toContain('08:49');
  const whole = JSON.stringify(s);
  const full = importRun(exportRun(s)),
    compact = importRun(exportRun(s, true));
  expect(JSON.stringify(s)).toBe(whole);
  for (let i = 0; i < 17; i++) {
    read();
    step(s);
    step(full);
    step(compact);
  }
  expect(full).toEqual(s);
  expect(compact).toEqual(s);
});

test('pending roof return is not described as impossible when no job is retained', () => {
  const s = createGame(418, undefined, { edition: 'settlement-day/1' });
  const person = s.villagers[0];
  if (!person || !s.settlement) throw new Error('Missing resident');
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  for (let i = 0; i < 26; i++) step(s);
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
  while (s.tick < 200) {
    step(s);
    const a = s.longRoofBreak?.attempts[0];
    const world = s.settlement.actors.v1;
    if (a?.stage === 'rest' && !world?.job) {
      const reading = new WorkObservation().summary(s, person);
      expect(reading).not.toContain('Earlier work is not offered automatically');
      expect(reading).toContain('Roof break recorded');
      const full = importRun(exportRun(s));
      const compact = importRun(exportRun(s, true));
      for (let i = 0; i < 17; i++) {
        step(s);
        step(full);
        step(compact);
      }
      expect(JSON.stringify(full)).toBe(JSON.stringify(s));
      expect(JSON.stringify(compact)).toBe(JSON.stringify(s));
      expect(s.longRoofBreak?.attempts[0]?.stage).toBe('reoffered');
      return;
    }
  }
  throw new Error('Did not reach real pending roof rest without a retained job');
});
