/** One complete current save. File sessions never construct this native store. */
import { MAX_SOURCE_ARCHIVE_BYTES } from './source-archives';

export const COMPLETE_BYTES = MAX_SOURCE_ARCHIVE_BYTES;
export const FILE_AGGREGATE_BYTES = COMPLETE_BYTES * 2;
export type SaveRecord = {
  format: 'commonstead-current-gzip/1';
  revision: string;
  decodedBytes: number;
  sha256: string;
  bytes: Blob;
};
const digest = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
async function readBounded(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw new Error('Complete save exceeds 64 MiB. Download this run.');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export async function encodeSave(text: string): Promise<SaveRecord> {
  const decoded = new TextEncoder().encode(text);
  if (decoded.byteLength > COMPLETE_BYTES)
    throw new Error('Complete save exceeds 64 MiB. Download this run.');
  const bytes = await readBounded(
    new Blob([decoded]).stream().pipeThrough(new CompressionStream('gzip')),
    COMPLETE_BYTES,
  );
  return {
    format: 'commonstead-current-gzip/1',
    revision: crypto.randomUUID(),
    decodedBytes: decoded.byteLength,
    sha256: await digest(decoded),
    bytes: new Blob([bytes], { type: 'application/gzip' }),
  };
}
export async function decodeSave(raw: unknown): Promise<string> {
  const record = raw as SaveRecord;
  if (
    !record ||
    Object.keys(record).sort().join(',') !== 'bytes,decodedBytes,format,revision,sha256' ||
    record.format !== 'commonstead-current-gzip/1' ||
    typeof record.revision !== 'string' ||
    !record.revision.length ||
    !Number.isSafeInteger(record.decodedBytes) ||
    record.decodedBytes < 1 ||
    record.decodedBytes > COMPLETE_BYTES ||
    typeof record.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.sha256) ||
    !(record.bytes instanceof Blob) ||
    record.bytes.size > COMPLETE_BYTES
  )
    throw new Error('Invalid complete saved game metadata.');
  const bytes = await readBounded(
    record.bytes.stream().pipeThrough(new DecompressionStream('gzip')),
    record.decodedBytes,
  );
  if (bytes.byteLength !== record.decodedBytes || (await digest(bytes)) !== record.sha256)
    throw new Error('Complete saved game bytes do not match their metadata.');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
export function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('commonstead-native-current', 2);
    let abandoned = false;
    request.onupgradeneeded = () => {
      for (const name of ['current', 'admission'])
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      abandoned = true;
      reject(new Error('Close another Commonstead tab to open the saved game.'));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (abandoned) db.close();
      else resolve(db);
    };
  });
}
export class NativeSaveStore {
  private revision: string | undefined;
  get observedRevision() {
    return this.revision;
  }
  private epoch = 0;
  private active = false;
  private pending?: {
    text: string;
    current: () => boolean;
    epoch: number;
    resolve: (written: boolean) => void;
    reject: (error: unknown) => void;
  };
  invalidate() {
    this.epoch++;
    this.pending?.resolve(false);
    this.pending = undefined;
  }
  async read(): Promise<string | null> {
    const db = await database();
    try {
      const raw = await new Promise<SaveRecord | undefined>((resolve, reject) => {
        const request = db.transaction('current').objectStore('current').get('save');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (!raw) {
        this.revision = undefined;
        return null;
      }
      const text = await decodeSave(raw);
      this.revision = raw.revision;
      return text;
    } finally {
      db.close();
    }
  }
  write(text: string, current: () => boolean = () => true): Promise<boolean> {
    if (new TextEncoder().encode(text).byteLength > COMPLETE_BYTES)
      return Promise.reject(new Error('Complete save exceeds 64 MiB. Download this run.'));
    const epoch = ++this.epoch;
    // Only one active candidate and one replaceable pending string are retained.
    // Superseded callers resolve immediately, releasing their complete snapshots.
    return new Promise<boolean>((resolve, reject) => {
      this.pending?.resolve(false);
      this.pending = { text, current, epoch, resolve, reject };
      void this.drain();
    });
  }
  private async drain() {
    if (this.active) return;
    this.active = true;
    try {
      while (this.pending) {
        const candidate = this.pending;
        this.pending = undefined;
        try {
          candidate.resolve(await this.persist(candidate.text, candidate.current, candidate.epoch));
        } catch (error) {
          candidate.reject(error);
        }
      }
    } finally {
      this.active = false;
    }
  }
  private async persist(text: string, current: () => boolean, epoch: number): Promise<boolean> {
    if (epoch !== this.epoch || !current()) return false;
    const record = await encodeSave(text);
    if (epoch !== this.epoch || !current()) return false;
    const db = await database();
    try {
      // Read + compare + put share one transaction. Another tab cannot replace
      // the observed prior save between the ownership check and the write.
      return await new Promise<boolean>((resolve, reject) => {
        const transaction = db.transaction(['current', 'admission'], 'readwrite');
        let adopted = false;
        const held = transaction.objectStore('admission').get('intent');
        let heldIntent = false;
        held.onsuccess = () => {
          heldIntent = !!held.result;
        };
        const request = transaction.objectStore('current').get('save');
        request.onsuccess = () => {
          if (epoch !== this.epoch || !current() || heldIntent) return;
          if (request.result?.revision !== this.revision) {
            transaction.abort();
            return;
          }
          try {
            const put = transaction.objectStore('current').put(record, 'save');
            put.onsuccess = () => {
              // This is the final request boundary before automatic commit.
              if (epoch !== this.epoch || !current()) transaction.abort();
            };
            adopted = true;
          } catch (error) {
            transaction.abort();
            reject(error);
          }
        };
        transaction.oncomplete = () => {
          if (adopted) this.revision = record.revision;
          resolve(adopted);
        };
        transaction.onabort = transaction.onerror = () =>
          reject(
            transaction.error ??
              new Error('Saved game changed in another tab. Download this run before reloading.'),
          );
      });
    } finally {
      db.close();
    }
  }
}
