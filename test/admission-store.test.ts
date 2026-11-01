import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, expect, test, vi } from 'vitest';
import * as admission from '../src/admission-store';
import { CAST } from '../src/cast';
import { database, encodeSave, NativeSaveStore } from '../src/save-store';
import { createGame, exportRun } from '../src/sim';

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
    expect(await intents.discardUnused(pin, heads, () => true)).toBe(false);
  expect(await intents.discardUnused({ ...pin, source: 'other' }, unchanged, () => true)).toBe(false);
  expect(await intents.discardUnused({ ...pin, candidateSha256: 'other' }, unchanged, () => true)).toBe(
    false,
  );
  expect(await intents.discardUnused(pin, unchanged, () => false)).toBe(false);
  expect(await store.read()).toBe('old complete');
  await intents.markForwarded('intent', () => true, pin);
  expect(await intents.discardUnused(pin, unchanged, () => true)).toBe(false);

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

test('forwarded unused discard keeps all head, pin, previous-save and generation guards and refuses corrupt intent', async () => {
  const store = new NativeSaveStore();
  await store.read();
  await store.write('old complete');
  const intents = new admission.AdmissionStore();
  const base = createGame(418);
  const id = CAST[0]!.castId,
    other = CAST[1]!.castId,
    parent = 'a'.repeat(64);
  const expectedHeads = Object.fromEntries(CAST.map((c) => [c.castId, c.castId === id ? parent : null]));
  const chapter = {
    version: 'commonstead-retained/4' as const,
    inputs: [],
    claims: [],
    blocked: [],
    initial: Object.fromEntries(base.villagers.map((v) => [v.person.id, v.person])),
  };
  const candidate = JSON.stringify({
    run: exportRun(createGame(418, chapter)),
    heads: [],
    sources: [],
    fileOrigin: false,
  });
  const pin = await intents.stage(
    {
      id: 'empty',
      source: 'source',
      generation: 1,
      previousRevision: store.observedRevision,
      expectedHeads,
      claims: [],
      accepted: [],
      nonaccepted: CAST.map((c) => c.castId),
      rawPrepare: {},
      candidate,
    },
    () => true,
  );
  await intents.markForwarded('empty', () => true, pin);
  const original = await intents.read();
  const unchanged = Object.fromEntries(
    CAST.map((c) => [c.castId, c.castId === id ? { revision: parent } : null]),
  );
  for (const heads of [
    { ...unchanged, [id]: { revision: 'changed' } },
    { ...unchanged, [other]: { revision: 'new' } },
    { [id]: { revision: parent } },
    {},
  ])
    expect(await intents.discardUnused(pin, heads, () => true)).toBe(false);
  for (const changed of [
    { ...pin, generation: 2 },
    { ...pin, candidateSha256: 'other' },
    { ...pin, previousRevision: 'other' },
  ])
    expect(await intents.discardUnused(changed, unchanged, () => true)).toBe(false);
  expect(await intents.discardUnused(pin, unchanged, () => false)).toBe(false);
  const mutate = async (value: unknown, objectStore = 'admission', key = 'intent') => {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(objectStore, 'readwrite');
      tx.objectStore(objectStore).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  };
  for (const corrupt of [
    { ...original, phase: 'unknown' },
    { ...original, claims: undefined },
    { ...original, accepted: ['nora'] },
    { ...original, candidate: await encodeSave('not a candidate') },
    { ...original, expectedHeads: {} },
    { ...original, nonaccepted: [] },
    {
      ...original,
      candidate: await encodeSave(JSON.stringify({ ...JSON.parse(candidate), heads: [{ castId: id }] })),
    },
    {
      ...original,
      candidate: await encodeSave(
        JSON.stringify({
          ...JSON.parse(candidate),
          run: {
            ...JSON.parse(candidate).run,
            chapter: { ...chapter, inputs: [{ parent: { castId: id } }] },
          },
        }),
      ),
    },
  ]) {
    await mutate(corrupt);
    expect(await intents.discardUnused(admission.admissionPin(corrupt as never), unchanged, () => true)).toBe(
      false,
    );
  }
  await mutate(original);
  let stillCurrent = true;
  const remove = IDBObjectStore.prototype.delete;
  const staleAtDelete = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore['delete']>
  ) {
    const request = remove.apply(this, args);
    if (this.name === 'admission')
      request.addEventListener('success', () => {
        stillCurrent = false;
      });
    return request;
  });
  await expect(intents.discardUnused(pin, unchanged, () => stillCurrent)).rejects.toThrow();
  staleAtDelete.mockRestore();
  expect(await intents.read()).toEqual(original);
  expect(await store.read()).toBe('old complete');
  await mutate(await encodeSave('changed complete'), 'current', 'save');
  expect(await intents.discardUnused(pin, unchanged, () => true)).toBe(false);
  expect(await store.read()).toBe('changed complete');
  expect(await intents.read()).toEqual(original);
});

async function unusedFixture(change?: (run: Record<string, unknown>) => void) {
  const store = new NativeSaveStore();
  await store.read();
  await store.write('old complete');
  const intents = new admission.AdmissionStore(),
    base = createGame(418);
  const chapter = {
    version: 'commonstead-retained/4' as const,
    inputs: [],
    claims: [],
    blocked: [],
    initial: Object.fromEntries(base.villagers.map((v) => [v.person.id, v.person])),
  };
  const run = exportRun(createGame(418, chapter)) as Record<string, unknown>;
  change?.(run);
  const pin = await intents.stage(
    {
      id: 'r2-empty',
      source: 'source',
      generation: 1,
      previousRevision: store.observedRevision,
      expectedHeads: Object.fromEntries(CAST.map((c) => [c.castId, null])),
      claims: [],
      accepted: [],
      nonaccepted: CAST.map((c) => c.castId),
      rawPrepare: {},
      candidate: JSON.stringify({ run, heads: [], sources: [], fileOrigin: false }),
    },
    () => true,
  );
  await intents.markForwarded(pin.id, () => true, pin);
  return { store, intents, pin, heads: Object.fromEntries(CAST.map((c) => [c.castId, null])) };
}

test('Blob-only replacement during async decode keeps the changed unverified intent and exact old native save', async () => {
  const { store, intents, pin, heads } = await unusedFixture();
  const before = await intents.read();
  if (!before) throw Error('Missing fixture');
  const nativeRevision = store.observedRevision;
  const hook = intents as unknown as {
    unusedForwarded: (value: NonNullable<typeof before>) => Promise<boolean>;
  };
  const validate = hook.unusedForwarded.bind(intents);
  let changed: NonNullable<typeof before> | undefined;
  hook.unusedForwarded = async (value) => {
    const valid = await validate(value);
    if (valid && !changed) {
      const bytes = new Uint8Array(await value.candidate.bytes.arrayBuffer());
      bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
      changed = {
        ...value,
        candidate: { ...value.candidate, bytes: new Blob([bytes], { type: value.candidate.bytes.type }) },
      };
      expect(JSON.stringify(changed)).toBe(JSON.stringify(value));
      expect(admission.admissionPin(changed)).toEqual(pin);
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('admission', 'readwrite');
        tx.objectStore('admission').put(changed, 'intent');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }
    return valid;
  };
  const remove = vi.spyOn(IDBObjectStore.prototype, 'delete');
  const put = vi.spyOn(IDBObjectStore.prototype, 'put');
  expect(await intents.discardUnused(pin, heads, () => true)).toBe(false);
  expect(remove).not.toHaveBeenCalled();
  expect(put.mock.contexts.every((store) => (store as IDBObjectStore).name === 'admission')).toBe(true);
  expect(put).toHaveBeenCalledTimes(1); // The explicit synthetic Blob replacement only.
  remove.mockRestore();
  put.mockRestore();
  const held = await intents.read();
  expect(held).not.toBeNull();
  expect(await held!.candidate.bytes.arrayBuffer()).toEqual(await changed!.candidate.bytes.arrayBuffer());
  expect(await store.read()).toBe('old complete');
  expect(store.observedRevision).toBe(nativeRevision);
});

for (const mismatch of ['inputs', 'tick', 'paused', 'ended'])
  test(`checksum-valid serialized state ${mismatch} mismatch remains held`, async () => {
    const { store, intents, pin, heads } = await unusedFixture((run) => {
      const state = run.state as Record<string, unknown>;
      if (mismatch === 'inputs')
        state.inputs = [{ tick: 0, command: { kind: 'order', ids: ['v1'], target: 'wood' } }];
      if (mismatch === 'tick') state.tick = 1;
      if (mismatch === 'paused') state.chapterPaused = true;
      if (mismatch === 'ended') state.ended = true;
    });
    const before = await intents.read(),
      nativeRevision = store.observedRevision;
    const remove = vi.spyOn(IDBObjectStore.prototype, 'delete'),
      put = vi.spyOn(IDBObjectStore.prototype, 'put');
    expect(await intents.discardUnused(pin, heads, () => true)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    remove.mockRestore();
    put.mockRestore();
    expect(await intents.read()).toEqual(before);
    expect(await store.read()).toBe('old complete');
    expect(store.observedRevision).toBe(nativeRevision);
  });

for (const stop of ['cancelled', 'deadline', 'request-budget'])
  test(`atomic Blob read stops on ${stop} without deleting or writing either save`, async () => {
    const { store, intents, pin, heads } = await unusedFixture();
    const before = await intents.read(),
      nativeRevision = store.observedRevision;
    let calls = 0,
      current = true,
      release: ((value: ArrayBuffer) => void) | undefined;
    const original = Blob.prototype.arrayBuffer;
    const reads = vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(function (this: Blob) {
      if (++calls === 2) {
        if (stop === 'cancelled') current = false;
        return new Promise<ArrayBuffer>((resolve) => {
          release = resolve;
        });
      }
      return original.call(this);
    });
    let clocks = 0;
    const clock =
      stop === 'deadline'
        ? vi.spyOn(performance, 'now').mockImplementation(() => (++clocks === 1 ? 0 : 20_000))
        : null;
    const count = vi.spyOn(IDBObjectStore.prototype, 'count'),
      remove = vi.spyOn(IDBObjectStore.prototype, 'delete'),
      put = vi.spyOn(IDBObjectStore.prototype, 'put');
    try {
      await expect(intents.discardUnused(pin, heads, () => current)).rejects.toThrow();
      expect(calls).toBe(2);
      expect(count.mock.calls.length).toBeLessThanOrEqual(16_384);
      if (stop === 'request-budget') expect(count).toHaveBeenCalledTimes(16_384);
      expect(remove).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
    } finally {
      reads.mockRestore();
      clock?.mockRestore();
      count.mockRestore();
      remove.mockRestore();
      put.mockRestore();
      release?.(new ArrayBuffer(0));
    }
    expect(await intents.read()).toEqual(before);
    expect(await store.read()).toBe('old complete');
    expect(store.observedRevision).toBe(nativeRevision);
  });

for (const boundary of ['blob-ready', 'previous-native-read', 'delete-completion'])
  test(`hard deadline crossing at ${boundary} aborts and retains the intent and old native save`, async () => {
    const { store, intents, pin, heads } = await unusedFixture();
    const before = await intents.read(),
      nativeRevision = store.observedRevision;
    let now = 0,
      blobReads = 0,
      crossed = false;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const arrayBuffer = Blob.prototype.arrayBuffer;
    const reads = vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(async function (this: Blob) {
      const nth = ++blobReads,
        bytes = await arrayBuffer.call(this);
      if (boundary === 'blob-ready' && nth === 2) {
        now = 20_000;
        crossed = true;
      }
      return bytes;
    });
    const originalGet = IDBObjectStore.prototype.get;
    const get = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['get']>
    ) {
      const request = originalGet.apply(this, args);
      if (boundary === 'previous-native-read' && this.name === 'current')
        request.addEventListener('success', () => {
          now = 20_000;
          crossed = true;
        });
      return request;
    });
    const originalDelete = IDBObjectStore.prototype.delete;
    const remove = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['delete']>
    ) {
      const request = originalDelete.apply(this, args);
      if (boundary === 'delete-completion' && this.name === 'admission')
        request.addEventListener('success', () => {
          now = 20_000;
          crossed = true;
        });
      return request;
    });
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    try {
      await expect(intents.discardUnused(pin, heads, () => true)).rejects.toThrow();
      expect(crossed).toBe(true);
      expect(blobReads).toBe(2);
      expect(put).not.toHaveBeenCalled();
      expect(remove).toHaveBeenCalledTimes(boundary === 'delete-completion' ? 1 : 0);
    } finally {
      clock.mockRestore();
      reads.mockRestore();
      get.mockRestore();
      remove.mockRestore();
      put.mockRestore();
    }
    expect(await intents.read()).toEqual(before);
    expect(await store.read()).toBe('old complete');
    expect(store.observedRevision).toBe(nativeRevision);
  });
