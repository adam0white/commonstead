import { restoreRun } from '@adam0white/human-framework';
import { requireCurrentRun } from './current-policy';
/** Termination cancels synchronous public archive validation without blocking the UI. */
export async function validateArchiveOffThread(
  raw: unknown,
  options: {
    signal?: AbortSignal;
    progress?: (tick: number) => void;
  } = {},
): Promise<void> {
  options.signal?.throwIfAborted();
  requireCurrentRun(raw);
  const hf = raw.hf;
  if (typeof Worker === 'undefined') {
    const result = restoreRun(hf);
    if (!result.ok)
      throw new Error(
        'This saved game could not be checked in this version of Commonstead. The file was not loaded. Keep the original file and try another file or start a new game.',
      );
    return;
  }
  const worker = new Worker(new URL('./validation-worker.ts', import.meta.url), { type: 'module' });
  await new Promise<void>((resolve, reject) => {
    const stop = () => {
      worker.terminate();
      options.signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      stop();
      reject(options.signal?.reason ?? new Error('Loading cancelled.'));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      stop();
      if (data.ok === true) resolve();
      else
        reject(
          new Error(
            data.error ??
              'This saved game could not be checked in this version of Commonstead. The file was not loaded. Keep the original file and try another file or start a new game.',
          ),
        );
    };
    worker.onerror = (event) => {
      stop();
      reject(new Error(event.message));
    };
    worker.postMessage(raw);
  });
}
