import { gunzipSync } from 'node:zlib';
import { createLab, FEEDBACK_LABELS } from '@adam0white/lab-client';
import { expect, test, vi } from 'vitest';
import { prefillFeedbackChoice } from '../src/feedback.ts';

test('ordinary choice notes retain note receipts and recording-off privacy', async () => {
  const edited = "I'm stopping because the order controls are unclear.";
  expect(prefillFeedbackChoice(edited, FEEDBACK_LABELS.stopping, FEEDBACK_LABELS.confused)).toBe(
    `I'm confused\n\n${edited}`,
  );
  expect(
    prefillFeedbackChoice("I'm stopping\n\nMy words.", FEEDBACK_LABELS.stopping, FEEDBACK_LABELS.confused),
  ).toBe("I'm confused\n\nMy words.");
  expect(prefillFeedbackChoice(FEEDBACK_LABELS.stopping, FEEDBACK_LABELS.stopping, '')).toBe('');
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  const envelopes: Record<string, unknown>[] = [];
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('location', { hostname: 'human.adamwhite.work', origin: 'https://human.adamwhite.work' });
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
    const bytes = await (init.body as Blob).arrayBuffer();
    const envelope = JSON.parse(gunzipSync(bytes).toString());
    envelopes.push(envelope);
    // Client 0.4.14+ retires a record only on a stored receipt for its own id.
    return Response.json({ ok: true, id: envelope.id ?? 'mock-note-receipt' });
  });
  try {
    const lab = createLab({ game: 'commonstead' });
    const run = { seed: 17, inputs: [], state: { clock: 4 } };
    const note = `${FEEDBACK_LABELS.stopping}\n\nI need to leave.`;
    expect(envelopes).toHaveLength(0);
    const receipt = await lab.sendFeedback(note, { run });
    expect(receipt).toBeTruthy();
    const sentNote = envelopes.find((entry) => entry.kind === 'note');
    const sentRun = envelopes.find((entry) => entry.kind === 'run');
    expect(sentNote?.data).toEqual({ note });
    expect(sentRun).toBeDefined();
    if (!sentRun) throw new Error('Optional run missing');
    expect(JSON.parse((sentRun.data as { text: string }).text)).toEqual(run);
    for (const key of ['player', 'session', 'runId']) expect(sentNote?.[key]).toBe(sentRun?.[key]);
    lab.setTelemetryOff(true);
    envelopes.length = 0;
    await lab.sendFeedback(FEEDBACK_LABELS.confused, { run });
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]).toMatchObject({ note: "I'm confused", run: { feedbackOnly: true } });
    expect(envelopes[0]?.player).toBeUndefined();
    expect(lab.telemetryOn).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
