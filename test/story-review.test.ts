// HF4 current-policy controls use the single canonical long scenario. Historical source stays frozen at c98.
import { afterEach, expect, test, vi } from 'vitest';
import { apply, createGame, exportRun, importRun, step } from '../src/sim.ts';
import { updateStoryControls } from '../src/story-ui.ts';

// Minimal DOM surface for the production renderer. This is not browser evidence.
class Node {
  id = '';
  dataset: Record<string, string> = {};
  textContent = '';
  disabled = false;
  className = '';
  type = '';
  children: Node[] = [];
  onclick?: () => void;
  listeners: Record<string, () => void> = {};
  append(...nodes: Node[]) {
    this.children.push(...nodes);
  }
  replaceChildren() {
    this.children = [];
  }
  addEventListener(event: string, callback: () => void) {
    this.listeners[event] = callback;
  }
  click() {
    this.listeners.click?.();
    this.onclick?.();
  }
  querySelector(selector: string): Node | null {
    const matches = (node: Node) =>
      selector.startsWith('#')
        ? node.id === selector.slice(1)
        : selector === `[data-story="${node.dataset.story}"]` ||
          selector === `[data-reason="${node.dataset.reason}"]`;
    for (const child of this.children) {
      if (matches(child)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}
afterEach(() => vi.unstubAllGlobals());
test('cached evening controls retain the node and dispatch the current selected residents', () => {
  vi.stubGlobal('document', { createElement: () => new Node() });
  const host = new Node();
  const commands: unknown[] = [];
  const state = { settlement: { storm: {} }, story: undefined } as unknown as Parameters<
    typeof updateStoryControls
  >[1];
  updateStoryControls(host as unknown as HTMLElement, state, ['v1', 'v2'], (c) => commands.push(c));
  const button = host.querySelector('[data-story="evening-roof"]')!;
  updateStoryControls(host as unknown as HTMLElement, state, ['v3', 'v4'], (c) => commands.push(c));
  expect(host.querySelector('[data-story="evening-roof"]')).toBe(button);
  button.click();
  expect(commands).toEqual([{ kind: 'long-roof-break-return', ids: ['v3', 'v4'] }]);
});

for (const id of ['v1', 'v7'] as const) {
  test(`actual preparation and first reply retain both spent sheets; ${id} second reply owns its exact first sheet`, () => {
    const s = createGame(42, undefined, { edition: 'settlement-replies/2' });
    apply(s, { kind: 'order', ids: [id], target: 'move', x: 525, y: 475 });
    while (s.tick < 60) step(s);
    apply(s, { kind: 'settlement', ids: [id], action: 'story' });
    const actor = s.villagers.find((v) => v.id === id)!;
    while (!actor.discovery && s.tick < 180) step(s);
    expect(actor.discovery).toBe(1);
    const prepare = id === 'v1' ? 'prepare-drawing' : 'prepare-draft';
    apply(s, { kind: 'story-act', ids: [id], choice: prepare });
    while (!s.story?.events.some((e) => e.choice === prepare) && s.tick < 320) step(s);
    expect(s.story?.events.some((e) => e.choice === prepare)).toBe(true);
    const prepared = s.story!.objects[0]!;
    const preparedBefore = structuredClone(prepared);
    if (id === 'v7') {
      expect(prepared.text).toBe('I called you lazy. I did not know that you were caring for a sick parent.');
      expect(prepared.sendable).toBe(true);
    }
    const branch = id === 'v1' ? 'nora-record-question' : 'sevim-no-answer';
    apply(s, { kind: 'reply', ids: [id], branch });
    while (!s.story!.firstResults!.length && s.tick < 440) step(s);
    const first = s.story!.firstResults![0]!;
    expect(first).toBeDefined();
    const sheet = s.story!.objects.find((o) => o.id === `sheet:${first.id}`)!;
    expect(sheet).toBeDefined();
    expect(s.story!.objects).toHaveLength(2);
    expect(s.story!.paper).toBe(2);
    if (id === 'v7') expect(sheet.sendable).toBe(false);
    const choice = id === 'v1' ? 'nora-question-attach' : 'sevim-space-preserve';
    apply(s, { kind: 'story-act', ids: [id], choice });
    const attempt = s.story!.attempts.at(-1)!;
    expect(attempt.objectId).toBe(sheet.id);
    expect(attempt.version).toBe(sheet.version);
    expect(attempt.predecessors).toEqual([first.id]);
    // Interrupt the actual running exchange, then retry the same paid first sheet.
    const startLimit = s.tick + 40;
    while (attempt.status === 'requested' && s.tick < startLimit) step(s);
    expect(attempt.status).toBe('running');
    expect(attempt.objectId).toBe(sheet.id);
    expect(attempt.version).toBe(1);
    apply(s, { kind: 'settlement', ids: [id], action: 'cancel' });
    apply(s, { kind: 'story-act', ids: [id], choice });
    expect(s.story!.attempts.at(-1)!.objectId).toBe(sheet.id);
    while (!s.story!.events.some((e) => e.choice === choice) && s.tick < 590) step(s);
    expect(s.story!.events.find((e) => e.choice === choice)?.objectId).toBe(sheet.id);
    expect(sheet.version).toBe(2);
    expect(prepared).toEqual(preparedBefore);
    expect(s.story!.paper).toBe(2);
    expect(s.story!.objects).toHaveLength(2);
    if (id === 'v7') expect(sheet.sendable).toBe(false);
  });
}

// CS-R7/R9/R11: both public first-reply routes share one paid attempt owner.
test('long public reply routes share paid retry, completed lock, departure provenance and transcript', async () => {
  const { publicTranscript } = await import('../src/public-history');
  const { prepareDeparture } = await import('../src/departure-source');
  const s = createGame(42, undefined, { edition: 'settlement-replies/2' }),
    id = 'v1';
  apply(s, { kind: 'order', ids: [id], target: 'move', x: 525, y: 475 });
  while (s.tick < 60) step(s);
  apply(s, { kind: 'settlement', ids: [id], action: 'story' });
  while (!s.villagers[0]!.discovery && s.tick < 180) step(s);
  apply(s, { kind: 'story-act', ids: [id], choice: 'nora-record-question' });
  const pendingTranscript = publicTranscript(s, id);
  expect(pendingTranscript.some((e) => e.text.includes('Will you write down'))).toBe(false);
  while (!s.story!.firstResults.length && s.tick < 340) step(s);
  expect(s.story!.firstResults).toHaveLength(1);
  const first = s.story!.firstResults[0]!;
  expect(() => apply(s, { kind: 'reply', ids: [id], branch: 'nora-restore-drawing' })).toThrow();
  const transcript = publicTranscript(s, id);
  expect(transcript.some((e) => e.source === first.id && e.text === first.says)).toBe(true);
  expect(transcript.some((e) => e.text.includes('Will you write down'))).toBe(true);
  apply(s, { kind: 'pause-chapter' });
  while (!s.chapterPaused && s.tick < 400) step(s);
  const departure = await prepareDeparture(s, id, { test: 'actual-long-reply' });
  expect(departure.objects.some((o) => o.id === `sheet:${first.id}`)).toBe(true);
  const sheet = s.story!.objects.find((o) => o.id === `sheet:${first.id}`)!;
  const originalSheet = structuredClone(sheet);
  for (const change of [{ actor: 'v7' }, { version: 0 }, { id: 'sheet:forged' }]) {
    Object.assign(sheet, change);
    await expect(prepareDeparture(s, id, {})).rejects.toThrow(/source/);
    Object.assign(sheet, originalSheet);
  }
  sheet.source = 'unresolved-forgery';
  await expect(prepareDeparture(s, id, {})).rejects.toThrow(/source/);
});

// CS-R7: interrupt an actually paid activity, then retry through the other public route.
test('both long first-reply command directions retain the same paid sheet on retry', () => {
  for (const firstRoute of ['reply', 'story-act'] as const) {
    const s = createGame(42, undefined, { edition: 'settlement-replies/2' });
    apply(s, { kind: 'order', ids: ['v1'], target: 'move', x: 525, y: 475 });
    while (s.tick < 60) step(s);
    apply(s, { kind: 'settlement', ids: ['v1'], action: 'story' });
    while (!s.villagers[0]!.discovery && s.tick < 180) step(s);
    const request = (route: typeof firstRoute, branch: 'nora-record-question' | 'nora-restore-drawing') =>
      apply(
        s,
        route === 'reply'
          ? { kind: 'reply', ids: ['v1'], branch }
          : { kind: 'story-act', ids: ['v1'], choice: branch },
      );
    request(firstRoute, 'nora-record-question');
    const scene = s.settlement!.replyScenes!.v1!;
    while (scene.attempts.at(-1)!.status === 'requested' && s.tick < 250) step(s);
    expect(scene.attempts.at(-1)!.status).toBe('running');
    expect(s.story!.paper).toBe(3);
    const reserved = structuredClone(scene.reservation),
      sheet = s.story!.objects.find((o) => o.id === reserved!.sheetId)!;
    expect(sheet.version).toBe(0);
    apply(s, { kind: 'settlement', ids: ['v1'], action: 'cancel' });
    const other = firstRoute === 'reply' ? 'story-act' : 'reply';
    expect(() => request(other, 'nora-restore-drawing')).toThrow();
    request(other, 'nora-record-question');
    while (!s.story!.firstResults.length && s.tick < 450) step(s);
    expect(s.story!.firstResults).toHaveLength(1);
    expect(scene.reservation).toEqual(reserved);
    expect(s.story!.firstResults[0]!.id).toBe(reserved!.resultId);
    expect(s.story!.firstResults[0]!.attemptId).toBe(scene.attempts[1]!.id);
    expect(s.story!.objects.find((o) => o.id === sheet.id)).toBe(sheet);
    expect(sheet.version).toBe(1);
    expect(s.story!.paper).toBe(3);
    expect(scene.attempts.map((a) => a.paperSpent)).toEqual([1, 0]);
    expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
  }
});

// The public exchange uses the same stable node while current selection owns the command.
test('public introduction control retains focus node and dispatches the current selected pair', () => {
  vi.stubGlobal('document', { createElement: () => new Node() });
  const host = new Node(),
    s = createGame(418),
    commands: unknown[] = [];
  updateStoryControls(host as unknown as HTMLElement, s, ['v4', 'v8'], (c) => commands.push(c));
  const button = host.querySelector('[data-story="public-role-0"]')!;
  updateStoryControls(host as unknown as HTMLElement, s, ['v3', 'v5'], (c) => commands.push(c));
  expect(host.querySelector('[data-story="public-role-0"]')).toBe(button);
  button.click();
  expect(commands).toEqual([{ kind: 'public-exchange', ids: ['v3', 'v5'], topic: 'role' }]);
});
