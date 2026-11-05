import type { PersonaEnvelope } from '@adam0white/lab-client';

export type SourceArchive = { revision: string; source: PersonaEnvelope['source']; snapshot: unknown };
const referenceFormat = 'commonstead-source-reference/1';
const archiveFormat = 'commonstead-hf-source-gzip/1';
/** The importer retains its existing 64 MiB expanded HF archive bound. */
export const MAX_SOURCE_ARCHIVE_BYTES = 64 * 1024 * 1024;
type PackedArchive = {
  format: typeof archiveFormat;
  encoding: 'base64';
  compression: 'gzip';
  archiveFormat: 'hf-run';
  archiveVersion: 5 | 7;
  fullHash: string;
  decodedBytes: number;
  sha256: string;
  data: string;
};
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const fail = (): never => {
  throw new Error(
    'The complete saved source archive is invalid or exceeds capacity. Keep the original file.',
  );
};
function rawHash(snapshot: unknown): string | undefined {
  const value = object(snapshot);
  const hashes = object(value?.hashes);
  return value?.format === 'hf-run' &&
    (value.version === 5 || value.version === 7) &&
    typeof hashes?.full === 'string'
    ? hashes.full
    : undefined;
}
function packed(snapshot: unknown): PackedArchive | undefined {
  const value = object(snapshot);
  if (typeof value?.format !== 'string' || !value.format.startsWith('commonstead-hf-source-gzip/')) return;
  if (
    value.format !== archiveFormat ||
    Object.keys(value).sort().join(',') !==
      'archiveFormat,archiveVersion,compression,data,decodedBytes,encoding,format,fullHash,sha256' ||
    value.encoding !== 'base64' ||
    value.compression !== 'gzip' ||
    value.archiveFormat !== 'hf-run' ||
    (value.archiveVersion !== 5 && value.archiveVersion !== 7) ||
    typeof value.fullHash !== 'string' ||
    !value.fullHash.length ||
    value.fullHash.length > 500 ||
    !Number.isSafeInteger(value.decodedBytes) ||
    (value.decodedBytes as number) < 1 ||
    (value.decodedBytes as number) > MAX_SOURCE_ARCHIVE_BYTES ||
    typeof value.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.sha256) ||
    typeof value.data !== 'string' ||
    value.data.length > Math.ceil(MAX_SOURCE_ARCHIVE_BYTES / 3) * 4 ||
    !value.data.length ||
    value.data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)
  )
    fail();
  return value as PackedArchive;
}
function archiveHash(snapshot: unknown): string | undefined {
  return packed(snapshot)?.fullHash ?? rawHash(snapshot);
}
async function boundedBytes(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) fail();
      chunks.push(next.value);
    }
  } catch {
    await reader.cancel().catch(() => {});
    fail();
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
/** Keep compressed source contents under the loader's existing recursive data policy. */
function safeJson(value: unknown, depth = 0): void {
  if (depth > 100) fail();
  if (typeof value === 'number' && !Number.isFinite(value)) fail();
  if (Array.isArray(value)) {
    for (const child of value) safeJson(child, depth + 1);
    return;
  }
  if (value && typeof value === 'object')
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail();
      safeJson((value as Record<string, unknown>)[key], depth + 1);
    }
}
async function decoded(snapshot: unknown): Promise<{ value: unknown; text: string }> {
  const wrapper = packed(snapshot);
  if (!wrapper) {
    const text = JSON.stringify(snapshot);
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_SOURCE_ARCHIVE_BYTES)
      fail();
    return { value: snapshot, text };
  }
  try {
    const binary = atob(wrapper.data);
    if (btoa(binary) !== wrapper.data || binary.length > MAX_SOURCE_ARCHIVE_BYTES) fail();
    const compressed = Uint8Array.from(binary, (value) => value.charCodeAt(0));
    const bytes = await boundedBytes(
      new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),
      wrapper.decodedBytes,
    );
    if (bytes.byteLength !== wrapper.decodedBytes || (await sha256(bytes)) !== wrapper.sha256) fail();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value: unknown = JSON.parse(text);
    safeJson(value);
    if (rawHash(value) !== wrapper.fullHash || object(value)?.version !== wrapper.archiveVersion) fail();
    return { value, text };
  } catch {
    return fail();
  }
}
/** Decode the exact original JSON. This verifies compressed bytes, UTF8, format and hashes. */
export async function decodeSourceSnapshot(snapshot: unknown): Promise<unknown> {
  return (await decoded(snapshot)).value;
}
/** Each checkpoint keeps its provenance. Identical original community bytes are retained once. */
export async function retainSource(
  sources: readonly SourceArchive[],
  next: SourceArchive,
): Promise<SourceArchive[]> {
  validateSourceReferences(sources);
  const hash = archiveHash(next.snapshot);
  if (!hash) return [...sources, next];
  const original = await decoded(next.snapshot);
  if (rawHash(original.value) !== hash) fail();
  for (const prior of sources) {
    if (archiveHash(prior.snapshot) !== hash) continue;
    if ((await decoded(prior.snapshot)).text === original.text)
      return [
        ...sources,
        { ...next, snapshot: { format: referenceFormat, revision: prior.revision, fullHash: hash } },
      ];
  }
  safeJson(original.value);
  const bytes = new TextEncoder().encode(original.text);
  const compressed = await boundedBytes(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),
    MAX_SOURCE_ARCHIVE_BYTES,
  );
  const wrapper: PackedArchive = {
    format: archiveFormat,
    encoding: 'base64',
    compression: 'gzip',
    archiveFormat: 'hf-run',
    archiveVersion: object(original.value)?.version as 5 | 7,
    fullHash: hash,
    decodedBytes: bytes.byteLength,
    sha256: await sha256(bytes),
    data: base64(compressed),
  };
  return [...sources, { ...next, snapshot: wrapper }];
}
/** Synchronous structural checks. References resolve directly to an earlier complete archive in this file. */
export function validateSourceReferences(sources: readonly SourceArchive[]): void {
  for (const [index, entry] of sources.entries()) {
    packed(entry.snapshot);
    const ref = object(entry.snapshot);
    if (typeof ref?.format !== 'string' || !ref.format.startsWith('commonstead-source-reference/')) continue;
    if (
      ref.format !== referenceFormat ||
      Object.keys(ref).sort().join(',') !== 'format,fullHash,revision' ||
      typeof ref.revision !== 'string' ||
      typeof ref.fullHash !== 'string' ||
      !sources
        .slice(0, index)
        .some((prior) => prior.revision === ref.revision && archiveHash(prior.snapshot) === ref.fullHash)
    )
      throw new Error(
        'The saved source reference has no complete archive in this file. Keep the original file.',
      );
  }
}
/** Call before installing a loaded file or local state. No decoded bytes escape verification. */
export async function validateSourceArchives(sources: readonly SourceArchive[]): Promise<void> {
  validateSourceReferences(sources);
  for (const entry of sources) {
    const ref = object(entry.snapshot);
    if (ref?.format === referenceFormat) continue;
    await decoded(entry.snapshot);
  }
}
