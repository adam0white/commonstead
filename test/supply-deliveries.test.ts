import { expect, test } from 'vitest';
import { deliveryReading, goalForecast } from '../src/goal-forecast.ts';
import { createGame, type State } from '../src/sim.ts';

// Detached fixtures exercise projection arithmetic only, never game receipts.
const fixture = (tick: number, work: unknown): State =>
  ({
    tick,
    ended: false,
    settlement: {},
    story: { work },
  }) as State;
const row = (at: number, target: string, amount: number, kind = 'delivery') => ({
  actor: 'v1',
  at,
  kind,
  target,
  amount,
});

test('delivery window uses completed raw totals and discloses flooring', () => {
  expect(deliveryReading(fixture(0, []))).toEqual(['No game time has passed.']);
  expect(deliveryReading(fixture(1, []))[0]).toContain('last 1 game second.');
  const text = deliveryReading(
    fixture(100, [
      row(40, 'wood', 99),
      row(41, 'wood', 0.06),
      row(100, 'wood', 0.06),
      row(100, 'stone', 0),
      row(90, 'food', 50),
      row(90, 'wood', 50, 'build'),
    ]),
  );
  expect(text[0]).toContain('0.1 boards and 0 ballast bags');
  expect(text[0]).toContain('rounded down');
  expect(deliveryReading(fixture(1, [row(1, 'wood', 0.01)]))[0]).toContain('delivered 0 boards');
  expect(deliveryReading(fixture(1, [row(1, 'wood', 0)]))[0]).toContain('No boards');
});

test('invalid or unavailable history does not claim zero deliveries', () => {
  for (const work of [
    undefined,
    [null],
    [{}],
    [row(0, 'wood', 1)],
    [row(2, 'wood', 1)],
    [row(0.5, 'wood', 1)],
    [row(-1, 'wood', 1)],
    [row(NaN, 'food', 1)],
    [row(1, 'wood', NaN)],
    [row(1, 'wood', -1)],
    [row(1, 'wood', Number.MAX_VALUE), row(1, 'wood', Number.MAX_VALUE)],
  ])
    expect(deliveryReading(fixture(1, work))).toEqual(['Recent delivery information is unavailable.']);
  for (const tick of [-1, 0.5, NaN, Infinity])
    expect(deliveryReading(fixture(tick, []))).toEqual(['Recent delivery information is unavailable.']);
  expect(deliveryReading({ ...fixture(1, []), story: undefined })).toEqual([
    'Recent delivery information is unavailable.',
  ]);
  expect(deliveryReading({ ...fixture(1, []), settlement: undefined })).toEqual([]);
  expect(
    deliveryReading({ ...createGame(418, undefined, { edition: 'settlement-replies/2' }), ended: true }),
  ).toEqual([]);
});

import { apply, exportRun, importRun, stateHash, step } from '../src/sim.ts';
import { advanceForecastDay, forecastDay, storehouse } from './goal-forecast-scenario.ts';

test('public settlement trace preserves delivery evidence, replay and storm outcome', async () => {
  const run = forecastDay(),
    s = run.s;
  let carried: { id: string; resource: 'wood' | 'stone' | 'food'; amount: number } | undefined;
  let delivered = false,
    spent = false,
    replayed = false,
    accepted = false,
    storm = false;
  const checkpoints: number[] = [];
  const compareCheckpoint = (tick: number) => {
    expect(s.tick).toBe(tick);
    const capture = (state: State) => ({
      state: JSON.stringify(state),
      inputs: JSON.stringify(state.inputs),
      hash: stateHash(state),
      full: JSON.stringify(exportRun(state)),
      compact: JSON.stringify(exportRun(state, true)),
    });
    const original = capture(s);
    const fullArchive = JSON.stringify((JSON.parse(original.full) as { hf: unknown }).hf);
    expect(JSON.stringify((JSON.parse(original.compact) as { hf: unknown }).hf)).toBe(fullArchive);
    const reading = deliveryReading(s);
    expect(deliveryReading(s)).toEqual(reading);
    // Freeze the actual projection inputs independently of the live Run.
    const work = Object.freeze(s.story!.work.map((entry) => Object.freeze({ ...entry })));
    const projection = Object.freeze({
      tick: s.tick,
      ended: s.ended,
      settlement: Object.freeze({}),
      story: Object.freeze({ work }),
    }) as unknown as State;
    expect(deliveryReading(projection)).toEqual(reading);
    expect(deliveryReading(projection)).toEqual(reading);
    expect(capture(s)).toEqual(original);
    checkpoints.push(tick);
    console.info(
      'CHECKPOINT',
      JSON.stringify({
        tick,
        fullBytes: original.full.length,
        compactBytes: original.compact.length,
        archiveBytes: fullArchive.length,
        hash: original.hash,
        reading,
      }),
    );
  };
  for (let i = 0; i < 1801 && !s.ended; i++) {
    const needsExport =
      (!replayed && Object.values(s.settlement!.actors).some((a) => a.carried && a.carried.amount > 0)) ||
      (!storehouse(s) && s.resources.wood >= 180 && s.resources.stone >= 120);
    const before = needsExport || i % 100 === 0 ? JSON.stringify(s) : '';
    const full = needsExport ? JSON.stringify(exportRun(s)) : '';
    const compact = needsExport ? JSON.stringify(exportRun(s, true)) : '';
    const reading = deliveryReading(s);
    expect(deliveryReading(s)).toEqual(reading);
    if (before) expect(JSON.stringify(s)).toBe(before);
    if (needsExport) {
      const hash = stateHash(s);
      deliveryReading(s);
      expect(stateHash(s)).toBe(hash);
      expect(JSON.stringify(exportRun(s))).toBe(full);
      expect(JSON.stringify(exportRun(s, true))).toBe(compact);
    }
    if (!carried) {
      const entry = Object.entries(s.settlement!.actors).find(([, a]) => a.carried && a.carried.amount > 0);
      if (entry?.[1].carried) {
        carried = { id: entry[0], ...entry[1].carried };
        expect(s.story!.work.filter((w) => w.kind === 'delivery')).toEqual([]);
        expect(reading[0]).toContain('No boards');
        console.info(
          'CARRY',
          JSON.stringify({ tick: s.tick, carried, resources: s.resources, work: s.story?.work }),
        );
        const restored = [importRun(JSON.parse(full)), importRun(JSON.parse(compact))];
        for (const copy of restored) {
          expect(JSON.stringify(copy)).toBe(before);
          expect(deliveryReading(copy)).toEqual(reading);
          expect(JSON.stringify(exportRun(copy))).toBe(full);
        }
        const id = s.villagers.find(
          (v) =>
            v.id !== carried!.id &&
            !s.settlement!.actors[v.id]?.carried &&
            (!s.settlement!.actors[v.id]?.running || s.settlement!.actors[v.id]?.running?.purpose === 'body'),
        )?.id;
        if (id) {
          const refused = { kind: 'order' as const, ids: [carried.id], target: 'stone' };
          for (const copy of [s, ...restored]) apply(copy, refused);
          expect(s.message).toContain('Return these carried materials');
          expect(s.settlement!.actors[carried.id]?.carried).toEqual({
            resource: carried.resource,
            amount: carried.amount,
          });
          expect(deliveryReading(s)).toEqual(reading);
          console.info('REFUSED', JSON.stringify({ tick: s.tick, refused, message: s.message }));
          const command = { kind: 'order' as const, ids: [id], target: 'wood' };
          for (const copy of [s, ...restored]) apply(copy, command);
          accepted =
            s.settlement!.actors[id]?.job?.kind === 'gather' &&
            s.settlement!.actors[id]?.job?.target === 'wood';
          for (const copy of [s, ...restored]) step(copy);
          for (const copy of restored) {
            expect(JSON.stringify(copy)).toBe(JSON.stringify(s));
            expect(stateHash(copy)).toBe(stateHash(s));
            expect(JSON.stringify(exportRun(copy, true))).toBe(JSON.stringify(exportRun(s, true)));
          }
          console.info(
            'CONTINUATION',
            JSON.stringify({ tick: s.tick, command, accepted, message: s.message }),
          );
          replayed = true;
          continue;
        }
      }
    }
    const priorWork = s.story!.work.length;
    const priorActor = carried && s.settlement!.actors[carried.id]?.carried;
    const priorResources = { ...s.resources },
      priorSite = !!storehouse(s),
      priorInputs = s.inputs.length;
    advanceForecastDay(run);
    if (carried && priorActor && !s.settlement!.actors[carried.id]?.carried) {
      const row = s
        .story!.work.slice(priorWork)
        .find(
          (w) =>
            w.kind === 'delivery' &&
            w.actor === carried!.id &&
            w.target === carried!.resource &&
            w.amount === carried!.amount,
        );
      if (row) {
        expect(s.resources[carried.resource]).toBeCloseTo(priorResources[carried.resource] + carried.amount);
        const recent = s.story!.work.filter(
          (w) => w.kind === 'delivery' && w.at > Math.max(0, s.tick - 60) && w.at <= s.tick,
        );
        const boards = recent.filter((w) => w.target === 'wood').reduce((sum, w) => sum + w.amount, 0);
        const bags = recent.filter((w) => w.target === 'stone').reduce((sum, w) => sum + w.amount, 0);
        expect(deliveryReading(s)[0]).toContain(
          `${Math.floor(boards * 10) / 10} boards and ${Math.floor(bags * 10) / 10} ballast bags`,
        );
        delivered = true;
        console.info(
          'DELIVERY',
          JSON.stringify({
            tick: s.tick,
            row,
            before: priorResources,
            after: s.resources,
            reading: deliveryReading(s),
          }),
        );
      }
    }
    if (!priorSite && storehouse(s)) {
      const commands = s.inputs.slice(priorInputs);
      const build = commands.find((v) => v.command.kind === 'build');
      expect(build).toBeDefined();
      const branch = importRun(JSON.parse(full));
      for (const input of commands) apply(branch, input.command);
      expect(storehouse(branch)).toBeTruthy();
      expect(branch.resources.wood).toBeCloseTo(priorResources.wood - 180);
      expect(branch.resources.stone).toBeCloseTo(priorResources.stone - 120);
      expect(branch.story!.work).toEqual(JSON.parse(before).story.work);
      expect(deliveryReading(branch)).toEqual(reading);
      spent = true;
      console.info(
        'SPEND',
        JSON.stringify({
          tick: branch.tick,
          commands,
          before: priorResources,
          after: branch.resources,
          reading,
        }),
      );
    }
    if (s.tick === 900 || s.tick === 1800) compareCheckpoint(s.tick);
    if (s.settlement!.storm && !storm) {
      storm = true;
      expect(goalForecast(s, null)[0]).toContain(s.won ? 'supplies stayed dry' : 'supplies got soaked');
      console.info(
        'STORM',
        JSON.stringify({ tick: s.tick, won: s.won, site: storehouse(s), reading: deliveryReading(s) }),
      );
    }
    if (i % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (s.ended) {
    expect(deliveryReading(s)).toEqual([]);
  }
  console.info(
    'TRACE',
    JSON.stringify({
      tick: s.tick,
      inputs: s.inputs,
      carried,
      delivered,
      spent,
      replayed,
      accepted,
      storm,
      ended: s.ended,
    }),
  );
  expect({ carried: !!carried, delivered, spent, replayed, accepted, storm }).toEqual({
    carried: true,
    delivered: true,
    spent: true,
    replayed: true,
    accepted: true,
    storm: true,
  });
  expect(s.ended).toBe(true);
  expect(checkpoints).toEqual([900, 1800]);
}, 180_000);
