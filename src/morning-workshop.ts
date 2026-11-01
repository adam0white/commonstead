import { communityTime, registeredCommunityTime } from './hf4.ts';
import type { State } from './sim.ts';
import { retainWorkshopClosing } from './workshop-continuation.ts';

/** Host-authored objectives only. The retained HF Run owns time, bodies and decisions. */
export type MorningWorkshop = {
  version: 'morning-workshop/1';
  startedTick: number;
  startedAtMs: number;
  endAtMs: number;
  targetCabinId: string | null;
  endedAtTick: number | null;
};

export function morningWorkshopEligibility(s: State): { eligible: boolean; reason: string | null } {
  const continuation = s.continuedWorkshop;
  const atMs = s.villagers[0] ? communityTime(s.villagers[0].person) : undefined;
  const eligible = !!(
    !s.settlement &&
    !s.morningWorkshop &&
    continuation &&
    s.story?.storm &&
    s.ended &&
    s.chapterPaused &&
    s.villagers.every((v) => !v.person.activity) &&
    atMs !== undefined &&
    atMs >= continuation.endAtMs &&
    // Ordinary half-minute stepping may cross the clock boundary after recorded HF ingress.
    // Admission is only at that stopped boundary, never later play or a shifted clock.
    atMs < continuation.endAtMs + 30000
  );
  return {
    eligible,
    reason: eligible
      ? null
      : 'Continue this workshop to its actual 08:00 ending before starting the morning task.',
  };
}

export function startMorningWorkshop(s: State): void {
  const startedAtMs = registeredCommunityTime(s.villagers[0]!.person);
  const eligibility = morningWorkshopEligibility(s);
  if (!eligibility.eligible) throw new Error(eligibility.reason!);
  s.morningWorkshop = {
    version: 'morning-workshop/1',
    startedTick: s.tick,
    startedAtMs,
    endAtMs: s.continuedWorkshop!.endAtMs + 120 * 60000,
    targetCabinId: null,
    endedAtTick: null,
  };
  retainWorkshopClosing(s);
  s.ended = false;
  s.chapterPaused = false;
  s.pauseRequested = false;
  if (s.remainder) s.remainder.running = false;
  s.message =
    'Morning workshop: prepare a further guest cabin and keep at least 40 meal units in the shared store by 10:00. Choosing a new cabin site costs 40 boards. Earlier work and supplies remain.';
}

/** Called only after the native build path admits and pays for an actual new site. */
export function registerMorningCabin(s: State, siteId: string): void {
  const morning = s.morningWorkshop;
  if (!morning || morning.endedAtTick !== null || morning.targetCabinId !== null) return;
  const site = s.buildings.find((b) => b.id === siteId);
  if (site?.kind === 'house') morning.targetCabinId = siteId;
}

/** The single short-workshop horizon consumed by simulation and public act admission. */
export function workshopEndTick(s: State): number {
  const morning = s.morningWorkshop;
  return morning
    ? morning.startedTick + Math.ceil((morning.endAtMs - morning.startedAtMs) / 30000)
    : (s.continuedWorkshop?.endTick ?? 600);
}

export function workshopDeadlineReached(s: State): boolean {
  const endAtMs = s.morningWorkshop?.endAtMs ?? s.continuedWorkshop?.endAtMs;
  return endAtMs !== undefined && registeredCommunityTime(s.villagers[0]!.person) >= endAtMs;
}

export function finishMorningWorkshop(s: State): void {
  if (s.morningWorkshop) s.morningWorkshop.endedAtTick = s.tick;
}

export function morningWorkshopView(s: State) {
  const morning = s.morningWorkshop;
  if (!morning) return null;
  const site = s.buildings.find((b) => b.id === morning.targetCabinId);
  const cabinComplete = site?.kind === 'house' && site.complete;
  const mealsMet = s.resources.food >= 40;
  const deadlineReached = communityTime(s.villagers[0]!.person) >= morning.endAtMs;
  return {
    ...morning,
    cabinProgress: site?.kind === 'house' ? site.progress : 0,
    cabinComplete,
    countedMeals: s.resources.food,
    mealTarget: 40,
    mealsMet,
    deadlineReached,
    targetsMet: morning.endedAtTick !== null && deadlineReached && cabinComplete && mealsMet,
    objective: 'Prepare a further guest cabin and keep at least 40 meal units in the shared store by 10:00.',
    cabinLine: site
      ? `The morning guest cabin is ${cabinComplete ? 'ready' : `${Math.floor(site.progress * 100)}% prepared`}.`
      : 'No new guest-cabin site has been chosen for this morning. Choosing its site costs 40 boards.',
    mealLine: `The shared store holds ${Math.floor(s.resources.food)} counted meal units, rounded down. The morning target is 40.`,
    resultLine:
      morning.endedAtTick === null
        ? 'Work, travel, meals and rest use the same morning. Residents still choose what they can manage.'
        : !deadlineReached
          ? 'The morning task stopped before 10:00. The 10:00 targets were not assessed.'
          : `The morning task ended. ${cabinComplete ? 'The target cabin is ready.' : 'The cabin target is unmet.'} ${mealsMet ? 'The meal target is met.' : 'The meal target is unmet.'}`,
  };
}
