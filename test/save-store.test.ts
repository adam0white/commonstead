import { expect, test } from 'vitest';
import { decodeSave, encodeSave } from '../src/save-store.ts';
import { createGame, exportRun, importRunAsync } from '../src/sim.ts';

test('complete gzip save verifies exact bytes and rejects forged metadata', async () => {
  const text = JSON.stringify({ note: '界', run: exportRun(createGame(418)) });
  const record = await encodeSave(text);
  expect(await decodeSave(record)).toBe(text);
  await expect(decodeSave({ ...record, decodedBytes: record.decodedBytes - 1 })).rejects.toThrow();
  await expect(decodeSave({ ...record, sha256: '0'.repeat(64) })).rejects.toThrow();
});

test('cooperative import retains exact actual Run and cancellation discards candidate', async () => {
  const raw = exportRun(createGame(418));
  const state = await importRunAsync(raw);
  expect(exportRun(state)).toEqual(raw);
  const controller = new AbortController();
  controller.abort();
  await expect(importRunAsync(raw, { signal: controller.signal })).rejects.toThrow();
});
