import { communityTime, registeredCommunityTime } from './hf4.ts';
import type { State } from './sim.ts';

/** A completed close is history, not an active request in a later stage. */
export function retainWorkshopClosing(s: State): void {
  if (!s.story?.close) return;
  s.story.closeHistory ??= [];
  s.story.closeHistory.push(structuredClone(s.story.close));
  delete s.story.close;
}

export function canContinueWorkshop(s: State): boolean {
  return !!(
    !s.settlement &&
    !s.morningWorkshop &&
    s.ended &&
    s.story?.storm &&
    s.chapterPaused &&
    s.villagers.every((v) => !v.person.activity) &&
    (!s.continuedWorkshop ||
      (s.story.close?.committedAt !== undefined &&
        communityTime(s.villagers[0]!.person) < s.continuedWorkshop.endAtMs))
  );
}
// One retained world/Run. No fresh authoring, admission, teleport, stock or calendar reset.
export function continueWorkshop(s: State): void {
  const runAtMs = registeredCommunityTime(s.villagers[0]!.person);
  if (!canContinueWorkshop(s))
    throw new Error('Finish the actual short storm and pause at its action boundary first.');
  let endAtMs = Math.floor(runAtMs / 86400000) * 86400000 + 480 * 60000;
  if (endAtMs <= runAtMs) endAtMs += 86400000;
  s.continuedWorkshop ??= {
    atTick: s.tick,
    runAtMs,
    endAtMs,
    endTick: s.tick + Math.ceil((endAtMs - runAtMs) / 30000),
    stormSourceId: `storm:${s.story!.storm!.at}`,
  };
  retainWorkshopClosing(s);
  s.ended = false;
  s.chapterPaused = false;
  s.pauseRequested = false;
  if (s.remainder) s.remainder.running = false;
  s.message =
    'Continue the same workshop after its storm. The residents keep their actual time, work and unfinished objects. No new morning or supplies have started.';
}
export function continuedClock(s: State): string {
  const at = s.villagers[0]!.person.now;
  return `${at >= 1440 ? 'Tomorrow ' : ''}${String(Math.floor(at / 60) % 24).padStart(2, '0')}:${String(Math.floor(at % 60)).padStart(2, '0')}`;
}
