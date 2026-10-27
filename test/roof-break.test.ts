import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { PRESSURE } from '../src/pressure.ts';
import { apply, createGame, exportRun, type GameCommand, importRun, type State, step } from '../src/sim.ts';

const advance = (s: State, n: number) => {
  for (let i = 0; i < n; i++) step(s);
};
const roof = (s: State, ids: string[]) => apply(s, { kind: 'roof-break-return', ids } as GameCommand);

// Removing the new public command must fail before any assertion about extension internals.
test('recorded roof break walks, rests under the real roof, then re-offers each exact earlier request', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  apply(s, { kind: 'order', ids: ['v2'], target: 'stone' });
  advance(s, 20);
  const prior = s.villagers.slice(0, 2).map((v) => structuredClone(v.order));
  const other = JSON.stringify(s.villagers[2]);
  roof(s, ['v1', 'v2']);
  expect(s.villagers.slice(0, 2).map((v) => v.order?.target)).toEqual(['shelter', 'shelter']);
  expect(JSON.stringify(s.villagers[2])).toBe(other);
  const entries = s.roofBreak!.attempts;
  expect(entries.map((a) => a.priorOrder)).toEqual(prior);
  expect(entries.map((a) => a.inputIndex)).toEqual([2, 2]);
  const beforeDuplicate = JSON.stringify(s);
  roof(s, ['v1']);
  expect(JSON.stringify(s)).toBe(beforeDuplicate);
  while (entries.some((a) => a.stage === 'roof') && s.tick < 50) step(s);
  expect(entries.every((a) => a.stage === 'rest')).toBe(true);
  for (const [i, a] of entries.entries()) {
    expect(a.restUntil! - a.restStarted!).toBe(35);
    expect(Math.hypot(s.villagers[i]!.x - 500, s.villagers[i]!.y - 350)).toBeLessThan(50);
  }
  const t = Math.max(...entries.map((a) => a.restUntil!));
  while (s.tick < t) step(s);
  expect(entries.every((a) => a.stage === 'reoffered')).toBe(true);
  expect(s.villagers.slice(0, 2).map((v) => v.order)).toEqual(prior);
  expect(s.villagers.slice(0, 2).every((v) => !v.person.activity?.protest)).toBe(true);
  for (const compact of [false, true]) {
    const raw = exportRun(s, compact) as { schema: number };
    expect(raw.schema).toBe(9);
    const loaded = importRun(JSON.parse(JSON.stringify(raw)));
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(s));
    advance(loaded, 17);
    const copy = structuredClone(s);
    advance(copy, 17);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(copy));
    expect(() => importRun({ ...raw, schema: 8 })).toThrow();
    expect(() => importRun({ ...raw, extension: { version: 'roof-break-return/0' } })).toThrow();
    expect(() => importRun({ ...raw, unknown: true })).toThrow();
  }
});

test('explicit interruptions never restore cancelled work; moving and already resting residents retain the actual request', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
  advance(s, 1); // still moving
  apply(s, { kind: 'order', ids: ['v2'], target: 'rest' });
  roof(s, ['v1', 'v2', 'v3']);
  expect(s.roofBreak!.attempts[1]!.priorOrder?.target).toBe('wood');
  expect(s.roofBreak!.attempts[1]!.priorTask).toBe('resting');
  apply(s, { kind: 'order', ids: ['v1'], target: 'stone' });
  expect(s.roofBreak!.attempts[0]!.stage).toBe('cancelled');
  advance(s, 60);
  expect(s.villagers[0]!.order?.target).toBe('stone');
  expect(s.villagers[1]!.order?.target).toBe('wood');
  expect(s.roofBreak!.attempts[2]!.stage).toBe('unavailable');
  expect(s.roofBreak!.attempts[2]!.result).toContain('No earlier work');
  roof(s, ['v2']);
  while (s.roofBreak!.attempts.at(-1)!.stage === 'roof') step(s);
  apply(s, { kind: 'order', ids: ['v2'], target: 'shelter' });
  advance(s, 60);
  expect(s.villagers[1]!.order).toBe(null);
  expect(s.roofBreak!.attempts.at(-1)!.stage).toBe('cancelled');
});

test('completed or removed sites are not re-offered and long-day carried work stays literal', () => {
  for (const remove of [false, true]) {
    const s = createGame(418, undefined, undefined, PRESSURE);
    apply(s, { kind: 'build', ids: ['v1'], building: 'house', x: 650, y: 500 });
    roof(s, ['v1']);
    // Counterfactual world intervention tests stale-target validation only; never exported as a legal replay.
    if (remove) s.buildings.pop();
    else s.buildings[1]!.complete = true;
    advance(s, 60);
    expect(s.roofBreak!.attempts[0]!.stage).toBe('unavailable');
    expect(s.villagers[0]!.order).toBe(null);
    expect(s.resources.wood).toBe(40);
  }
  const d = createGame(418, undefined, { edition: 'settlement-day/1' });
  apply(d, { kind: 'order', ids: ['v1'], target: 'wood' });
  advance(d, 26);
  expect(d.settlement!.actors.v1!.carried).not.toBe(null);
  const before = JSON.stringify(d);
  roof(d, ['v1']);
  expect(JSON.stringify(d)).toBe(before);
});

test('old schemas keep literal full/compact bytes and legal continuation without the new input', () => {
  const prefix = process.env.COMMONSTEAD_ROOF_BASELINE;
  if (!prefix) return;
  for (let i = 0; i < 6; i++) {
    const b = JSON.parse(readFileSync(`${prefix}-old-${i}.json`, 'utf8'));
    for (const compact of [false, true]) {
      const text = compact ? b.compact : b.full;
      const s = importRun(JSON.parse(text));
      expect(JSON.stringify(exportRun(s, compact))).toBe(text);
      advance(s, 17);
      expect(JSON.stringify(s)).toBe(b.continuation);
    }
  }
});

test('completed work stays complete; pause and storm cancel only unfinished stages', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, {
    kind: 'build',
    ids: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'],
    building: 'house',
    x: 650,
    y: 500,
  });
  advance(s, 15);
  roof(s, ['v1']);
  advance(s, 60);
  expect(s.buildings[1]!.complete).toBe(true);
  expect(s.roofBreak!.attempts[0]!.stage).toBe('unavailable');
  expect(s.resources.wood).toBe(40);
  expect(s.villagers[0]!.order).toBe(null);
  expect(JSON.stringify(importRun(exportRun(s)))).toBe(JSON.stringify(s));
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  roof(s, ['v1']);
  apply(s, { kind: 'pause-chapter' });
  expect(s.roofBreak!.attempts.at(-1)!.stage).toBe('cancelled');
  for (let i = 0; i < 60 && !s.chapterPaused; i++) step(s);
  apply(s, { kind: 'resume-chapter' });
  advance(s, 70);
  expect(s.villagers[0]!.order).toBe(null);
  while (s.tick < 590) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  roof(s, ['v1']);
  advance(s, 10);
  expect(s.ended).toBe(true);
  expect(s.roofBreak!.attempts.at(-1)!.stage).toBe('cancelled');
  const ended = JSON.stringify(s);
  advance(s, 100);
  roof(s, ['v1']);
  expect(JSON.stringify(s)).toBe(ended);
  expect(JSON.stringify(importRun(exportRun(s)))).toBe(ended);
});

test('complete source archives survive native and file loads; new extension cannot publish an old passport', async () => {
  const { Continuity } = await import('../src/continuity.ts');
  const { createFileSession } = await import('../src/file-session.ts');
  const c = new Continuity({ setPersonaRecording() {} } as never, {} as never);
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  roof(s, ['v1']);
  advance(s, 10);
  const sources = [
    {
      revision: 'synthetic-complete-source',
      source: { game: 'commonstead', build: 'control', engine: '2.23.0', rules: 'commonstead-3' },
      snapshot: { world: { materials: 123 }, person: 'opaque retained source' },
    },
  ];
  const native = JSON.stringify({
    run: exportRun(s),
    runId: 'synthetic',
    fileOrigin: false,
    heads: [],
    sources,
  });
  await c.loadLocal(native);
  await expect(c.checkpoint('hf.cast.nora.smallworks')).rejects.toThrow('cannot move to another game yet');
  const full = c.export(s);
  const f = createFileSession();
  expect(await f.select(new File([JSON.stringify(full)], 'roof.json'))).toBe(true);
  expect(f.snapshot()!.castSources).toEqual(sources);
  const compact = { ...(exportRun(s, true) as object), castSources: sources };
  expect(await f.select(new File([JSON.stringify(compact)], 'roof-compact.json'))).toBe(true);
  expect(f.snapshot()!.castSources).toEqual(sources);
  f.resume();
  f.advance(70);
  expect(f.snapshot()!.castSources).toEqual(sources);
  f.invalidate();
  const frozen = JSON.stringify(f.snapshot());
  f.advance(70);
  expect(JSON.stringify(f.snapshot())).toBe(frozen);
  const tiny = createFileSession({ currentBytes: 10 });
  await expect(tiny.select(new File([JSON.stringify(full)], 'roof.json'))).rejects.toThrow('capacity');
});
