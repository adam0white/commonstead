// HF4 current-policy controls use the single canonical long scenario. Historical source stays frozen at c98.
import { expect, test } from 'vitest';
import { FRAMEWORK_VERSION } from '../src/engine';
import { archiveCommunity, verifyCommunity } from '../src/hf4';
import { apply, createGame, exportRun, importRun, step } from '../src/sim';
import { fundedShort } from './current-short-control';

test('training adds a helper to the correct game when another game is open', () => {
  const first = fundedShort(41);
  apply(first, { kind: 'train' });
  const second = createGame(42);
  for (let i = 0; i < 15; i++) step(first);
  expect(archiveCommunity(first.villagers[0]!.person).initial.people).toHaveLength(8);
  expect(archiveCommunity(first.villagers[8]!.person)).toEqual(archiveCommunity(first.villagers[0]!.person));
  expect(archiveCommunity(second.villagers[0]!.person).initial.people).toHaveLength(8);
});

test('normal game work runs in one HF4 community and replays completely', () => {
  const s = createGame(42);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  for (let i = 0; i < 40; i++) step(s);
  const archive = archiveCommunity(s.villagers[0]!.person);
  expect(archive.version).toBe(5);
  expect(archive.initial.people).toHaveLength(8);
  expect(s.resources.wood).toBeGreaterThan(80);
  const proof = verifyCommunity(s.villagers[0]!.person);
  expect(proof.verified).toBe(true);
  expect(proof.fullHash).toBe(archive.hashes.full);
  const restored = importRun(exportRun(s));
  expect(restored).toEqual(s);
  expect(exportRun(importRun(exportRun(restored)))).toEqual(exportRun(s));
});

test('retained longer-day resident enters another longer-day opening without losing duties', async () => {
  const { residentTransfer, admitResident } = await import('../src/passport');
  const { canonicalCast, createPersona, initialPersonaLife, preparePersonaLife } = await import(
    '@adam0white/lab-client'
  );
  const s = createGame(42, undefined, { edition: 'settlement-replies/2' });
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  for (let i = 0; i < 26; i++) step(s);
  apply(s, { kind: 'pause-chapter' });
  while (!s.chapterPaused && s.tick < 120) step(s);
  expect(s.chapterPaused).toBe(true);
  const p = s.villagers[0]!.person;
  const captured = await residentTransfer(p);
  const clock = 1790000000000;
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId: p.id,
    castRevision: canonicalCast(p.id).revision,
    branchId: 'retained-control',
    parentRevision: null,
    source: { game: 'commonstead', build: 'control', engine: FRAMEWORK_VERSION, rules: 'commonstead-4' },
    transfer: { ...captured.transfer, life: initialPersonaLife(p.id, 'retained-control', clock) },
    limitations: captured.limitations,
  });
  const target = createGame(43, undefined, { edition: 'settlement-replies/2' }).villagers[0]!.person;
  expect(admitResident(preparePersonaLife(envelope, clock), target).agenda.commitments.length).toBe(
    p.agenda.commitments.length,
  );
}, 60000);
