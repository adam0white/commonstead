import { validatePortablePerson } from '@adam0white/human-framework';
import { CAST } from './cast';
import { archiveCommunity, isContinuingCommitment } from './hf4';
import { residentTransfer } from './passport';
import { REPLIES } from './settlement-scenes';
import { exportRun, type State } from './sim';
import { activeStory } from './story-records';

/** A complete local source factory. A portable projection grants no receiver custody. */
export async function prepareDeparture(s: State, id: string, identity: unknown) {
  const v = s.villagers.find((v) => v.id === id);
  if (!v || !CAST.some((c) => c.castId === v.person.id))
    throw new Error('Select an actual canonical resident. Helpers remain in the complete native source.');
  if (
    (!s.ended && !s.chapterPaused) ||
    s.villagers.some((p) => p.person.activity) ||
    v.order ||
    activeStory(s, id) ||
    s.story?.objects.some((o) => o.holder !== null)
  )
    throw new Error(
      'Finish or explicitly stop current activities, travel and object carrying before preparing a departure.',
    );
  const source = archiveCommunity(v.person),
    captured = await residentTransfer(v.person),
    portable = validatePortablePerson(captured.transfer.portable);
  const objects = structuredClone(s.story?.objects ?? []);
  const events = [...(s.story?.sources ?? []), ...(s.story?.events ?? [])];
  for (const o of objects) {
    // CS-R9: a completed first sheet resolves through its actual result and attempt owner.
    const first = s.story?.firstResults.find((r) => r.id === o.source);
    const legacy =
      first && s.settlement?.replyScenes?.[first.actor]?.attempts.find((a) => a.id === first.attemptId);
    const story = first && s.story?.attempts.find((a) => a.id === first.attemptId);
    const firstSource =
      !!first &&
      o.actor === first.actor &&
      REPLIES[first.branch]?.actor === first.actor &&
      o.id === `sheet:${first.id}` &&
      o.version === 1 &&
      o.text === first.text &&
      ((legacy?.status === 'completed' &&
        legacy.resultId === first.id &&
        legacy.branch === first.branch &&
        legacy.endedAt === first.at) ||
        (story?.status === 'completed' &&
          story.actor === first.actor &&
          story.choice === first.branch &&
          story.endedAt === first.at &&
          first.id === `${story.id}:result`));
    const reserved = s.settlement?.replyScenes?.[o.actor];
    const paidSource =
      o.version === 0 &&
      reserved?.reservation?.sheetId === o.id &&
      reserved.reservation.paidAttemptId === o.source &&
      reserved.attempts.some((a) => a.id === o.source && a.paperSpent === 1);
    if (
      !(first
        ? firstSource
        : paidSource ||
          events.some((e) => e.id === o.source) ||
          s.story?.attempts.some((a) => a.id === o.source)) ||
      !Number.isSafeInteger(o.version) ||
      o.version < 0 ||
      !Number.isFinite(o.point.x) ||
      !Number.isFinite(o.point.y)
    )
      throw new Error('An object lacks its exact retained source/version/place.');
  }
  return {
    format: 'commonstead-local-departure/1' as const,
    identity: structuredClone(identity),
    actor: v.person.id,
    native: exportRun(s),
    calendar: structuredClone(source.initial.spec.definitions.calendar),
    portable,
    duties: structuredClone(
      v.person.agenda.commitments.filter((c) => isContinuingCommitment(v.person.agenda, c)),
    ),
    owed: structuredClone(v.person.agenda.owed ?? []),
    objects,
    stock: structuredClone(s.resources),
    buildings: structuredClone(s.buildings),
    publication: {
      supported: false as const,
      reason:
        'No registered receiver contract binds this complete Commonstead source, calendar, per-actor retirement and object custody. Keep this local candidate; no shelf write was made.',
    },
  };
}
