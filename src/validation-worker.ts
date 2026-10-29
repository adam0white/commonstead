import { restoreRun } from '@adam0white/human-framework';

self.onmessage = ({ data }: MessageEvent<unknown>) => {
  try {
    const result = restoreRun(data);
    self.postMessage(
      result.ok
        ? { ok: true }
        : {
            ok: false,
            error:
              'This saved game could not be checked in this version of Commonstead. The file was not loaded. Keep the original file and try another file or start a new game.',
          },
    );
  } catch {
    self.postMessage({
      ok: false,
      error:
        'This saved game could not be checked in this version of Commonstead. The file was not loaded. Keep the original file and try another file or start a new game.',
    });
  }
};
