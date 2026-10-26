import type { Place, Point } from './paths.ts';
/** Authored fictional outcomes only; no invented recipient responses or real accessibility/lab evidence. */
export type SceneId = 'correction' | 'visit' | 'telescope' | 'letter' | 'trial';
export const SCENES: Record<
  SceneId,
  { label: string; map: Place; point: Point; ticks: number; boards: number; paper: number; meals: number }
> = {
  correction: {
    label: 'Correct an old fictional record',
    map: 'quay',
    point: { x: 750, y: 175 },
    ticks: 20,
    boards: 0,
    paper: 1,
    meals: 0,
  },
  visit: {
    label: 'Visit family off the quay',
    map: 'quay',
    point: { x: 800, y: 575 },
    ticks: 70,
    boards: 0,
    paper: 0,
    meals: 4,
  },
  telescope: {
    label: 'Carry the telescope outside',
    map: 'courtyard',
    point: { x: 775, y: 175 },
    ticks: 30,
    boards: 0,
    paper: 0,
    meals: 0,
  },
  letter: {
    label: 'Post the private letter',
    map: 'courtyard',
    point: { x: 175, y: 175 },
    ticks: 15,
    boards: 0,
    paper: 1,
    meals: 0,
  },
  trial: {
    label: 'Try the easier grip together',
    map: 'yard',
    point: { x: 700, y: 475 },
    ticks: 25,
    boards: 4,
    paper: 0,
    meals: 0,
  },
};
export function sceneAllowed(id: SceneId, resident: string): boolean {
  return id === 'correction'
    ? ['v2', 'v8'].includes(resident)
    : id === 'letter'
      ? resident === 'v7'
      : id === 'telescope'
        ? resident === 'v4'
        : id === 'trial'
          ? ['v1', 'v2'].includes(resident)
          : ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'].includes(resident);
}
export function sceneOutcome(id: SceneId, resident: string, clear: boolean): string {
  if (id === 'correction')
    return resident === 'v2'
      ? 'Sam amends the old fictional report where he shared it: he did not reproduce the problem. The amendment is now attached to that record.'
      : 'Oskar attaches a correction to the old fictional photo story: the volunteer went home before the storm. The original caption is marked inaccurate.';
  if (id === 'letter')
    return 'Sevim deposits her private acknowledgement in the fictional post slot. No reply or forgiveness is claimed.';
  if (id === 'visit')
    return 'The resident returns from the arranged family visit beyond the quay. The journey and time together happened. No reconciliation or private family response is claimed.';
  if (id === 'telescope')
    return clear
      ? 'Nerys spends the evening at the telescope. She sees a clear patch of sky.'
      : 'Nerys spends the evening at the telescope. Clouds hide the stars.';
  return 'Nora and Sam each handle the restored grip and compare it with the old shape. They record that the easier grip can be held with a loose hand. This fictional trial is finished; it is not a test with real users or lab acceptance.';
}

/** B3 scope: fresh local settlement-replies/1 only. These are authored paper acts and
 * outward words, never absent recipients' answers, moral assent or a short-chapter continuation.
 * Peer exchange, storm endings, relationships and the other six residents are outside this batch.
 */
export const REPLY_EDITION = 'settlement-replies/1';
export const REPLIES = {
  'nora-restore-drawing': {
    actor: 'v1',
    ticks: 12,
    object: 'drawing',
    line: 'You left the grip out without asking. Will you put it back on the drawing and mark the drawing unfinished?',
    text: 'The unfinished drawing includes the easier grip. The person who would use it has not been asked.',
    says: 'I have put the easier grip back on the drawing and marked it unfinished. I still need to ask the person who would use it.',
    later: 'The drawing includes the grip now. I have not heard from the person who would use it.',
  },
  'nora-record-question': {
    actor: 'v1',
    ticks: 8,
    object: 'drawing-question',
    line: 'The drawing cannot answer for the person who would use it. Will you write down what you still need to ask?',
    text: 'Would this grip help you use the handle?',
    says: 'I have written: “Would this grip help you use the handle?” I have not asked them yet.',
    later: 'The question is still here. Writing it did not give me an answer.',
  },
  'sevim-name-wrong': {
    actor: 'v7',
    ticks: 12,
    object: 'private-draft',
    line: 'You called him lazy before you knew. Will you put that plainly in your private draft?',
    text: 'I called you lazy. I did not know that you were caring for a sick parent.',
    says: 'I have written: “I called you lazy. I did not know that you were caring for a sick parent.” This is still a private draft.',
    later: 'The draft names what I said. I have not sent it or heard from him.',
  },
  'sevim-no-answer': {
    actor: 'v7',
    ticks: 8,
    object: 'private-draft-space',
    line: 'You have not heard from him. Will you leave room in the draft for an answer you cannot write for him?',
    text: 'I do not know how you would answer. [His answer is unwritten.]',
    says: 'I have added: “I do not know how you would answer.” I have left that answer unwritten.',
    later: 'His answer is still unwritten. I cannot fill it in for him.',
  },
} as const;
export type ReplyBranch = keyof typeof REPLIES;
export type ReplyAttempt = {
  id: string;
  branch: ReplyBranch;
  disclosureId: string;
  requestedAt: number;
  map: Place;
  point: Point;
  deliveredAt?: number;
  attended?: boolean;
  decision?: { chosenAffordanceId: string | null; verdict?: string; publicSays: string };
  startedAt?: number;
  until?: number;
  activityId?: string;
  activityStartedAt?: number;
  paperSpent: number;
  endedAt?: number;
  status: 'requested' | 'withheld' | 'start-failed' | 'running' | 'interrupted' | 'completed' | 'unavailable';
  reason?: string;
  resultId?: string;
};
export type ReplyScene = {
  disclosure: { id: string; at: number; textId: string };
  selectedBranch?: ReplyBranch;
  attempts: ReplyAttempt[];
  completedBranch?: ReplyBranch;
};
export type ReplyResult = {
  id: string;
  actor: string;
  branch: ReplyBranch;
  attemptId: string;
  at: number;
  object: string;
  text: string;
  says: string;
};
