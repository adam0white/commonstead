import { database, decodeSave, encodeSave, FILE_AGGREGATE_BYTES, type SaveRecord } from './save-store';

export type PreparedAdmission = {
  id: string;
  source: string;
  generation: number;
  previousRevision?: string;
  expectedHeads: Record<string, string | null>;
  claims: { castId: string; revision: string; [key: string]: unknown }[];
  accepted: string[];
  nonaccepted: string[];
  rawPrepare: unknown;
  candidate: string;
};
type Intent = Omit<PreparedAdmission, 'candidate'> & {
  candidate: SaveRecord;
  previousRevision?: string;
  phase: 'prepared' | 'forwarded';
};
export type AdmissionPin = {
  id: string;
  source: string;
  generation: number;
  previousRevision?: string;
  candidateRevision: string;
  candidateSha256: string;
};
export const admissionPin = (intent: Intent): AdmissionPin => ({
  id: intent.id,
  source: intent.source,
  generation: intent.generation,
  previousRevision: intent.previousRevision,
  candidateRevision: intent.candidate.revision,
  candidateSha256: intent.candidate.sha256,
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export class AdmissionStore {
  private async transaction<T>(work: (tx: IDBTransaction, done: (value: T) => void) => void): Promise<T> {
    const db = await database();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(['current', 'admission'], 'readwrite');
        let value: T;
        tx.oncomplete = () => resolve(value);
        tx.onabort = tx.onerror = () =>
          reject(tx.error ?? new Error('Prepared chapter changed or was cancelled.'));
        try {
          work(tx, (next) => {
            value = next;
          });
        } catch (error) {
          tx.abort();
          reject(error);
        }
      });
    } finally {
      db.close();
    }
  }
  async stage(input: PreparedAdmission, current: () => boolean) {
    if (!current()) throw new Error('Chapter cancelled before preparation.');
    const candidate = await encodeSave(input.candidate);
    return this.transaction<AdmissionPin>((tx, done) => {
      const held = tx.objectStore('admission').get('intent');
      held.onsuccess = () => {
        if (held.result || !current()) {
          tx.abort();
          return;
        }
        const prior = tx.objectStore('current').get('save');
        prior.onsuccess = () => {
          if (!current() || prior.result?.revision !== input.previousRevision) {
            tx.abort();
            return;
          }
          const { candidate: _text, ...metadata } = input;
          const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata)).byteLength;
          if (
            (prior.result?.decodedBytes ?? 0) + candidate.decodedBytes + metadataBytes >
            FILE_AGGREGATE_BYTES
          ) {
            tx.abort();
            return;
          }
          const intent: Intent = {
            ...structuredClone(input),
            candidate,
            previousRevision: prior.result?.revision,
            phase: 'prepared',
          };
          const put = tx.objectStore('admission').put(intent, 'intent');
          put.onsuccess = () => {
            if (!current()) tx.abort();
          };
          done(admissionPin(intent));
        };
      };
    });
  }
  async markForwarded(id: string, current: () => boolean, expected: AdmissionPin) {
    await this.transaction<void>((tx, done) => {
      const req = tx.objectStore('admission').get('intent');
      req.onsuccess = () => {
        const intent = req.result as Intent | undefined;
        if (!intent || intent.id !== id || !same(admissionPin(intent), expected) || !current()) {
          tx.abort();
          return;
        }
        intent.phase = 'forwarded';
        const put = tx.objectStore('admission').put(intent, 'intent');
        put.onsuccess = () => {
          if (!current()) tx.abort();
        };
        done();
      };
    });
  }
  async read(): Promise<Intent | null> {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction('admission').objectStore('admission').get('intent');
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }
  async preparedText(): Promise<string | null> {
    const intent = await this.read();
    return intent ? decodeSave(intent.candidate) : null;
  }
  async recover(
    heads: Record<string, unknown>,
  ): Promise<'accepted' | 'unclaimed' | 'unresolved' | 'no-admission'> {
    const intent = await this.read();
    if (!intent) return 'no-admission';
    if (
      Object.keys(intent.expectedHeads).some(
        (id) =>
          !Object.hasOwn(heads, id) ||
          (heads[id] !== null &&
            (typeof heads[id] !== 'object' ||
              typeof (heads[id] as { revision?: unknown })?.revision !== 'string')),
      )
    )
      return 'unresolved';
    // History is deliberately absent: only exact current full custody can authorize recovery.
    const accepted = Object.entries(intent.expectedHeads).every(([id, revision]) => {
      const claim = intent.claims.find((p) => p.castId === id);
      return claim
        ? same(heads[id], claim)
        : ((heads[id] as { revision?: string } | null)?.revision ?? null) === revision;
    });
    if (accepted && intent.claims.length) return 'accepted';
    const unchanged = Object.entries(intent.expectedHeads).every(
      ([id, revision]) => ((heads[id] as { revision?: string } | null)?.revision ?? null) === revision,
    );
    return unchanged ? 'unclaimed' : 'unresolved';
  }
  // CS-R4: only a never-forwarded, unchanged preparation can release the old save.
  async discardUnforwarded(
    expected: AdmissionPin,
    heads: Record<string, unknown>,
    current: () => boolean,
  ): Promise<boolean> {
    return this.transaction<boolean>((tx, done) => {
      const req = tx.objectStore('admission').get('intent');
      req.onsuccess = () => {
        const intent = req.result as Intent | undefined;
        if (
          !intent ||
          intent.phase !== 'prepared' ||
          !same(admissionPin(intent), expected) ||
          !current() ||
          Object.entries(intent.expectedHeads).some(
            ([id, revision]) =>
              !Object.hasOwn(heads, id) ||
              (heads[id] !== null &&
                (typeof heads[id] !== 'object' ||
                  typeof (heads[id] as { revision?: unknown }).revision !== 'string')) ||
              ((heads[id] as { revision?: string } | null)?.revision ?? null) !== revision,
          )
        ) {
          done(false);
          return;
        }
        const prior = tx.objectStore('current').get('save');
        prior.onsuccess = () => {
          if (!current() || prior.result?.revision !== intent.previousRevision) {
            done(false);
            return;
          }
          const remove = tx.objectStore('admission').delete('intent');
          remove.onsuccess = () => {
            if (!current()) tx.abort();
          };
          done(true);
        };
      };
    });
  }
  async promote(id: string, current: () => boolean, expected: AdmissionPin): Promise<boolean> {
    return this.transaction<boolean>((tx, done) => {
      const req = tx.objectStore('admission').get('intent');
      req.onsuccess = () => {
        const intent = req.result as Intent | undefined;
        if (
          !intent ||
          intent.id !== id ||
          intent.phase !== 'forwarded' ||
          !same(admissionPin(intent), expected) ||
          !current()
        ) {
          done(false);
          return;
        }
        const old = tx.objectStore('current').get('save');
        old.onsuccess = () => {
          if (!current() || old.result?.revision !== intent.previousRevision) {
            done(false);
            return;
          }
          const put = tx.objectStore('current').put(intent.candidate, 'save');
          put.onsuccess = () => {
            if (!current()) tx.abort();
          };
          const remove = tx.objectStore('admission').delete('intent');
          remove.onsuccess = () => {
            if (!current()) tx.abort();
          };
          done(true);
        };
      };
    });
  }
}
