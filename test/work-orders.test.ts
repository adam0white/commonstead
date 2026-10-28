import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { PRESSURE } from '../src/pressure.ts';
import { apply, createGame, exportRun, importRun, step } from '../src/sim.ts';
import { currentNotice, WorkObservation } from '../src/work-observation.ts';
import { materialFlow, orderConsequences, placementReason, routeCause } from '../src/work-orders.ts';

// Causal control: removing the truthful no-request projection makes this fail after real roof/rest.
test('rest retains eight orders, roof replaces them, and the public notice never promises lost work', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  const ids = s.villagers.map((v) => v.id);
  const advance = (n: number) => {
    for (let i = 0; i < n; i++) step(s);
  };
  apply(s, { kind: 'order', ids, target: 'wood' });
  advance(70);
  apply(s, { kind: 'order', ids, target: 'rest' });
  expect(s.villagers.every((v) => v.recoveryUntil === 105 && v.order?.target === 'wood')).toBe(true);
  advance(35);
  expect(s.villagers.every((v) => v.order?.target === 'wood')).toBe(true);
  expect(s.villagers.every((v) => v.person.activity || v.status.includes('refused'))).toBe(true);
  expect(orderConsequences(s, ids)).toContain('Assembly and gathering stop immediately');
  apply(s, { kind: 'order', ids, target: 'shelter' });
  advance(12);
  expect(s.villagers.every((v) => !v.order)).toBe(true);
  apply(s, { kind: 'order', ids, target: 'rest' });
  const raw = JSON.stringify(s);
  expect(currentNotice(s)).toContain('No earlier work request is retained');
  expect(currentNotice(s)).not.toContain('Work will resume');
  expect(JSON.stringify(s)).toBe(raw);
  advance(35);
  const observer = new WorkObservation();
  expect(observer.summary(s, s.villagers[0]!)).toContain('No work request is retained');
  expect(s.villagers.every((v) => !v.order && v.status === 'waiting')).toBe(true);
  const occupied = createGame(418, undefined, { edition: 'settlement-day/1' });
  apply(occupied, { kind: 'order', ids: ['v1'], target: 'wood' });
  for (let n = 0; n < 20; n++) step(occupied);
  const actorBefore = JSON.stringify(occupied.settlement?.actors.v1);
  apply(occupied, { kind: 'order', ids: ['v1'], target: 'stone' });
  expect(JSON.stringify(occupied.settlement?.actors.v1)).toBe(actorBefore);
  expect(occupied.settlement?.actors.v1?.pendingRequest).toBe(null);
  expect(orderConsequences(occupied, ['v1'])).toContain('not queued');
  expect(orderConsequences(occupied, ['v1'])).toContain('ask again');
  for (let n = 0; n < 6; n++) step(occupied);
  expect(occupied.settlement?.actors.v1?.carried?.resource).toBe('wood');
  const d = createGame(418, undefined, { edition: 'settlement-day/1' });
  apply(d, { kind: 'order', ids: ids.slice(0, 4), target: 'wood' });
  apply(d, { kind: 'order', ids: ids.slice(4), target: 'stone' });
  while (!d.settlement?.dispute && d.tick < 100) step(d);
  expect(d.tick).toBe(17);
  expect(routeCause(d)).toContain('Sam and Nora');
  expect(routeCause(d)).toContain('0:17');
  expect(routeCause(d)).toContain('without an agreement for their pair');
  apply(d, { kind: 'settlement', ids: ['v2'], action: 'yield' });
  while (!d.settlement?.routeAgreements.includes('v1/v2') && d.tick < 100) step(d);
  expect(d.settlement?.routeAgreements).toContain('v1/v2');
  expect(d.settlement?.actors.v2?.job).toBe(null);
  expect(d.settlement?.routeAgreements).toContain('v1/v2');
  while (!d.settlement?.dispute && d.tick < 100) step(d);
  expect(d.tick).toBeLessThanOrEqual(100);
  const pair = d.settlement?.dispute;
  if (!pair) throw new Error('Missing next route dispute');
  for (const id of pair) expect(routeCause(d)).toContain(d.villagers.find((v) => v.id === id)?.name ?? id);
  expect([...pair].sort().join('/')).not.toBe('v1/v2');
  expect(routeCause(d)).toContain('Nora and Sam');
  expect(materialFlow(d)).toContain('Completion time is unknown');
  expect(materialFlow(d)).toContain('game seconds');
  const before = JSON.stringify(d);
  for (const v of d.villagers) observer.summary(d, v);
  routeCause(d);
  materialFlow(d);
  orderConsequences(d, ids);
  expect(JSON.stringify(d)).toBe(before);
  // Pure projection of the actual failed short predicate; points between sampled dots remain legal.
  const p = createGame(418, undefined, undefined, PRESSURE);
  expect(placementReason(p, ['v1'], 245, 190)).toContain('prepared boards');
  apply(p, { kind: 'build', ids: ['v1'], building: 'house', x: 245, y: 190 });
  expect(p.buildings).toHaveLength(1);
  expect(p.resources.wood).toBe(80);
  expect(placementReason(p, ['v1'], 54, 500)).toContain('edge');
  expect(placementReason(p, ['v1'], 653, 503)).toBe('');
  apply(p, { kind: 'build', ids: ['v1'], building: 'house', x: 653, y: 503 });
  expect(p.buildings).toHaveLength(2);
  expect(p.resources.wood).toBe(40);
});

// Pre-edit production exports are external evidence, not rewritten fixture expectations.
// Enabled only by the author's explicit evidence path; the normal suite needs no private files.
test('literal pre-edit full and compact exports keep the same raw state and legal continuation', () => {
  const prefix = process.env.COMMONSTEAD_ORDER_BASELINE;
  if (!prefix) return;
  for (const name of ['short', 'day']) {
    const fullText = readFileSync(`${prefix}-${name}-baseline-full.json`, 'utf8');
    const compactText = readFileSync(`${prefix}-${name}-baseline-compact.json`, 'utf8');
    const full = importRun(JSON.parse(fullText)),
      compact = importRun(JSON.parse(compactText));
    expect(JSON.stringify(exportRun(full))).toBe(fullText);
    expect(JSON.stringify(exportRun(compact, true))).toBe(compactText);
    expect(JSON.stringify(full)).toBe(JSON.stringify(compact));
    const observer = new WorkObservation();
    for (let n = 0; n < 17; n++) {
      observer.observeState(full);
      for (const v of full.villagers) observer.summary(full, v);
      currentNotice(full);
      step(full);
      step(compact);
    }
    const expected = readFileSync(`${prefix}-${name}-baseline-continuation.json`, 'utf8');
    expect(JSON.stringify(full)).toBe(expected);
    expect(JSON.stringify(compact)).toBe(expected);
  }
});
