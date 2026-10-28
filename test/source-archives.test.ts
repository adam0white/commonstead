import { expect, test } from 'vitest';
import { FRAMEWORK_VERSION } from '../src/engine';
import {
  decodeSourceSnapshot,
  MAX_SOURCE_ARCHIVE_BYTES,
  retainSource,
  validateSourceArchives,
  validateSourceReferences,
} from '../src/source-archives';

const source = { game: 'commonstead', build: 'control', engine: FRAMEWORK_VERSION, rules: 'commonstead-4' };
test('gzip sources retain every original byte once and reject altered or incomplete archives', async () => {
  const snapshot = {
    format: 'hf-run',
    version: 5,
    hashes: { full: 'control' },
    transactions: [
      { inputs: ['complete source bytes', 'Turkish: ı İ ş; 😀', 'journal data '.repeat(10000)] },
    ],
  };
  const original = JSON.stringify(snapshot);
  const first = await retainSource([], { revision: 'person-one', source, snapshot });
  const packed = first[0]?.snapshot;
  expect(JSON.stringify(packed).length).toBeLessThan(original.length / 5);
  expect(JSON.stringify(await decodeSourceSnapshot(packed))).toBe(original);
  const all = await retainSource(first, {
    revision: 'person-two',
    source,
    snapshot: structuredClone(snapshot),
  });
  expect(all[0]).toEqual(first[0]);
  expect(all[1]?.snapshot).toEqual({
    format: 'commonstead-source-reference/1',
    revision: 'person-one',
    fullHash: 'control',
  });
  const loaded = JSON.parse(JSON.stringify(all));
  expect(() => validateSourceReferences(loaded)).not.toThrow();
  await expect(validateSourceArchives(loaded)).resolves.toBeUndefined();
  expect(() => validateSourceReferences(all.slice(1))).toThrow('no complete archive');
  const different = await retainSource(first, {
    revision: 'different',
    source,
    snapshot: { ...snapshot, transactions: [] },
  });
  expect(await decodeSourceSnapshot(different[1]?.snapshot)).toEqual({ ...snapshot, transactions: [] });
  if (!packed || typeof packed !== 'object') throw new Error('Missing compressed archive');
  const wrapper = packed as Record<string, unknown>;
  for (const change of [
    { fullHash: 'altered' },
    { sha256: '0'.repeat(64) },
    { archiveVersion: 4 },
    { decodedBytes: 1 },
    { decodedBytes: MAX_SOURCE_ARCHIVE_BYTES + 1 },
    { data: '!invalid base64!' },
    { data: String(wrapper.data).slice(0, -8) },
    { extra: true },
  ])
    await expect(decodeSourceSnapshot({ ...wrapper, ...change })).rejects.toThrow();
  const wrapText = async (text: string) => {
    const bytes = new TextEncoder().encode(text);
    const data = new Uint8Array(
      await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(),
    );
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return {
      ...wrapper,
      decodedBytes: bytes.byteLength,
      sha256: [...digest].map((v) => v.toString(16).padStart(2, '0')).join(''),
      data: btoa(String.fromCharCode(...data)),
    };
  };
  for (const unsafe of [
    JSON.stringify({ ...snapshot, danger: 0 }).replace('"danger":0', '"danger":1e999'),
    `${original.slice(0, -1)},"__proto__":{}}`,
    JSON.stringify({ ...snapshot, danger: [...Array(102)].reduce<unknown>((nested) => [nested], null) }),
    JSON.stringify({ ...snapshot, version: 4 }),
  ])
    await expect(decodeSourceSnapshot(await wrapText(unsafe))).rejects.toThrow();
  const stored = first[0],
    reference = all[1];
  if (!stored || !reference) throw new Error('Missing source records');
  await expect(
    validateSourceArchives([{ ...stored, snapshot: { ...wrapper, sha256: '0'.repeat(64) } }, reference]),
  ).rejects.toThrow();
});
