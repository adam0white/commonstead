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
