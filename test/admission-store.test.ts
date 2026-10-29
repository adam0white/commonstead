import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, expect, test, vi } from 'vitest';
import * as admission from '../src/admission-store';
import { NativeSaveStore } from '../src/save-store';

// One causal custody sequence; fake IndexedDB checks transactions, not browser disk durability.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
test('stages before claim, preserves old bytes on stale/unknown, and never recovers history-only custody', async () => {
  expect(admission.AdmissionStore).toBeTypeOf('function');
  const store = new NativeSaveStore();
  await store.read();
  await store.write('old complete');
  const intents = new admission.AdmissionStore();
  const claim = { castId: 'nora', revision: 'claimed', source: { game: 'commonstead' } };
  const payload = {
    id: 'intent',
    previousRevision: store.observedRevision,
    source: 'source',
    generation: 1,
    expectedHeads: { nora: 'parent', samir: null },
    claims: [claim],
    accepted: ['nora'],
    nonaccepted: ['samir'],
    rawPrepare: { inputs: ['actual'], blocked: [] },
    candidate: 'new complete',
  };
  const originalPut = IDBObjectStore.prototype.put;
  const quota = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore['put']>
  ) {
    if (this.name === 'admission') throw new DOMException('Synthetic quota', 'QuotaExceededError');
    return originalPut.apply(this, args);
  });
  await expect(intents.stage(payload, () => true)).rejects.toThrow();
  quota.mockRestore();
  expect(await store.read()).toBe('old complete');
  await expect(intents.stage(payload, () => false)).rejects.toThrow();
  expect(await store.read()).toBe('old complete');
  const pin = await intents.stage(payload, () => true);
  expect(await store.write('late ordinary save')).toBe(false);
  await expect(
    intents.markForwarded('intent', () => true, { ...pin, source: 'forged source' }),
  ).rejects.toThrow();
  expect(await store.read()).toBe('old complete');
  // CS-R4: unknown/mixed/advanced custody, stale source/digest and cancellation cannot release.
  const unchanged = { nora: { revision: 'parent' }, samir: null };
  for (const heads of [
    { nora: { revision: 'later' }, samir: null },
    { nora: claim, samir: null },
    { nora: null },
    {},
  ])
    expect(await intents.discardUnforwarded(pin, heads, () => true)).toBe(false);
  expect(await intents.discardUnforwarded({ ...pin, source: 'other' }, unchanged, () => true)).toBe(false);
  expect(await intents.discardUnforwarded({ ...pin, candidateSha256: 'other' }, unchanged, () => true)).toBe(
    false,
  );
  expect(await intents.discardUnforwarded(pin, unchanged, () => false)).toBe(false);
  expect(await store.read()).toBe('old complete');
  await intents.markForwarded('intent', () => true, pin);
  expect(await intents.discardUnforwarded(pin, unchanged, () => true)).toBe(false);

  expect(await intents.recover({ nora: { ...claim, revision: 'later' }, samir: null })).toBe('unresolved');
  expect(await store.read()).toBe('old complete');
  expect(await intents.recover({ nora: { ...claim, source: { game: 'foreign' } }, samir: null })).toBe(
    'unresolved',
  );
  expect(await intents.recover({ nora: claim, samir: null })).toBe('accepted');
  expect(await intents.promote('intent', () => true, { ...pin, candidateSha256: 'forged digest' })).toBe(
    false,
  );
  expect(await intents.promote('intent', () => true, { ...pin, generation: pin.generation + 1 })).toBe(false);
  expect(await intents.promote('intent', () => false, pin)).toBe(false);
  expect(await store.read()).toBe('old complete');
  let sourceCurrent = true;
  const originalDelete = IDBObjectStore.prototype.delete;
  const staleAtCommit = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore['delete']>
  ) {
    const req = originalDelete.apply(this, args);
    if (this.name === 'admission')
      req.addEventListener('success', () => {
        sourceCurrent = false;
      });
    return req;
  });
  await expect(intents.promote('intent', () => sourceCurrent, pin)).rejects.toThrow();
  staleAtCommit.mockRestore();
  expect(await store.read()).toBe('old complete');
  expect(await intents.promote('intent', () => true, pin)).toBe(true);
  expect(await store.read()).toBe('new complete');
});
