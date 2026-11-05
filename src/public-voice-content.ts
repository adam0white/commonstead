import { readRunHistory } from '@adam0white/human-framework';
import { CAST } from './cast';
import { assignmentText, nextTask, residentName } from './display';
import { archiveCommunity } from './hf4';
import type { Place, Point } from './paths';
import type { State, Villager } from './sim';
import { storyClock } from './story-records';

export type PublicCommand = {
  kind: 'public-exchange';
  ids: string[];
  topic: 'role' | 'work' | 'yield' | 'closing';
  sourceId?: string;
};
export type PublicFact = {
  kind: PublicCommand['topic'];
  sourceId: string;
  actor: string;
  nativeId: string;
  at: number;
  digest: string;
  text: string;
};
export const PUBLIC_ROLES = [
  'I design repairs and make things.',
  'I am learning repair work. I sometimes work in a kitchen and test games at Commonstead.',
  'I look after the dam and have worked there for thirty-one years.',
  'I run an inn and observe the river level.',
  'I prepare cold dishes.',
  'I work as an accountant.',
  'I am a retired teacher. I volunteer to teach reading and writing for everyday use.',
  'I work as a photographer and take climbing seriously as a hobby.',
] as const;
// Only public work facts author words. Neither private biography nor inferred assent is a source.
export function publicRole(s: State, v: Villager): PublicFact {
  if (!s.villagers.includes(v)) throw new Error('Select the current native resident.');
  const entry = CAST.find((c) => c.castId === v.person.id);
  let text: string | undefined =
    entry && v.assignment === entry.work ? PUBLIC_ROLES[CAST.indexOf(entry)] : undefined;
  if (!text) {
    for (const tag of [
      'cold station',
      'shared-kitchen planning',
      'accounts ledger',
      'invoice reconciliation',
      'volunteer reading tutor',
      'volunteer practical-writing tutor',
      'photography assignment',
      'photograph editing',
      'dam inspection',
      'dam records',
      'inn service',
      'inn stores',
      'repair design',
      'repair making',
      'supervised repair bench',
      'kitchen assistance',
    ]) {
      const assignment = assignmentText(tag, residentName(v));
      if (v.assignment === assignment) text = assignment.replace(`${residentName(v)} is `, 'I am ');
    }
  }
  if (!entry && v.assignment === 'The helper uses prepared materials for light tasks.')
    text = 'I use prepared materials for light tasks.';
  if (!text) throw new Error('No approved outward words match this person’s current public assignment.');
  return {
    kind: 'role',
    sourceId: `role:${v.person.id}`,
    actor: v.id,
    nativeId: v.person.id,
    at: 0,
    digest: JSON.stringify([v.person.id, v.assignment, v.role]),
    text,
  };
}
function applicable(s: State, v: Villager, c: PublicCommand): PublicFact {
  const role: PublicFact =
    c.topic === 'yield' || (c.topic === 'closing' && c.sourceId !== `role:${v.person.id}`)
      ? {
          kind: 'role',
          sourceId: `role:${v.person.id}`,
          actor: v.id,
          nativeId: v.person.id,
          at: 0,
          digest: JSON.stringify([v.person.id, v.assignment, v.role]),
          text: '',
        }
      : publicRole(s, v);
  if (c.topic === 'closing' && !s.continuedWorkshop && !s.settlement?.storm)
    throw new Error(
      'Closing words are available after continuing the short workshop or the long day’s actual storm.',
    );
  if (c.topic === 'role') return role;
  if (c.topic === 'closing' && c.sourceId === role.sourceId) return { ...role, kind: 'closing' };
  if (c.topic === 'work') {
    const index = Number(c.sourceId?.replace(/^input:/, ''));
    const input = s.inputs[index];
    if (
      !Number.isInteger(index) ||
      c.sourceId !== `input:${index}` ||
      !input ||
      !('ids' in input.command) ||
      !input.command.ids.includes(v.id) ||
      !['order', 'build', 'settlement'].includes(input.command.kind)
    )
      throw new Error('Choose this person’s actual dated work request.');
    if (input.command.kind === 'settlement' && !['gather', 'build', 'map'].includes(input.command.action))
      throw new Error('This source is not an ordinary work request.');
    const later = s.inputs
      .slice(index + 1)
      .some(
        (i, offset) =>
          !s.story?.rejectedPublicBuilds?.some(
            (r) => r.inputIndex === index + 1 + offset && r.at === i.tick && i.command.kind === 'build',
          ) &&
          'ids' in i.command &&
          i.command.ids.includes(v.id) &&
          ['order', 'build', 'settlement'].includes(i.command.kind),
      );
    if (later) throw new Error('A later request replaced this work request.');
    const request = input.command;
    const target =
      request.kind === 'build' ? request.building : 'target' in request ? (request.target ?? 'idle') : 'idle';
    return {
      ...role,
      kind: 'work',
      sourceId: c.sourceId!,
      at: input.tick,
      digest: JSON.stringify([role.digest, input]),
      text: `At ${storyClock(s, input.tick)}, you asked me about ${nextTask(target, s.buildings)}. ${role.text}`,
    };
  }
  if (c.topic === 'closing') {
    const first = s.story?.firstResults.find((e) => e.id === c.sourceId && e.actor === v.id);
    const event = s.story?.events.find(
      (e) => e.id === c.sourceId && e.actor === v.id && !e.choice.startsWith('collaboration-'),
    );
    const result = first ?? event;
    if (!result)
      throw new Error('Choose a matching completed answer or this person’s current public work fact.');
    const attempt = s.story?.attempts.find(
      (a) =>
        a.actor === v.id &&
        a.status === 'completed' &&
        (`${a.id}:result` === result.id || a.id === first?.attemptId),
    );
    const reply = s.settlement?.replyScenes?.[v.id]?.attempts.find(
      (a) => a.id === first?.attemptId && a.status === 'completed' && a.resultId === result.id,
    );
    const history = readRunHistory(archiveCommunity(v.person)).flatMap((t) => t.inputs);
    const completed = history.some(
      (i) =>
        i.kind === 'action.resolved' &&
        i.payload.person === v.person.id &&
        i.payload.stage === 'finish' &&
        i.payload.disposition === 'completed' &&
        i.payload.outcome?.status === 'completed' &&
        (attempt?.activity?.id === i.payload.activityId ||
          (!!attempt?.nativeActivities?.[v.id] && attempt.nativeActivities[v.id] === i.payload.activityId) ||
          (!!reply &&
            i.payload.outcome.target === reply.id &&
            i.payload.outcome.offerId === reply.activityId &&
            i.payload.outcome.start === Math.round(reply.activityStartedAt! * 60000))),
    );
    if (!completed)
      throw new Error('This completed record has no matching current native person’s finish receipt.');
    return {
      ...role,
      kind: 'closing',
      sourceId: result.id,
      at: result.at,
      digest: JSON.stringify([role.digest, result]),
      text: `At ${storyClock(s, result.at)}, the recorded result was: ${result.says}`,
    };
  }
  const archive = archiveCommunity(v.person);
  const inputs = readRunHistory(archive).flatMap((t) => t.inputs);
  const resolution = inputs.find((i) => i.id === c.sourceId && i.kind === 'action.resolved');
  if (
    !resolution ||
    resolution.kind !== 'action.resolved' ||
    resolution.payload.stage !== 'finish' ||
    resolution.payload.disposition !== 'completed' ||
    resolution.payload.outcome?.actionId !== 'yield' ||
    resolution.payload.outcome?.status !== 'completed'
  )
    throw new Error('Choose an actual completed Yield receipt, not a failed walk or route label.');
  const p = resolution.payload;
  const outcome = p.outcome!;
  const performer = s.villagers.find((x) => x.person.id === p.person);
  const target = /^day:([^:]+):yield:(v[1-9][0-9]?\/v[1-9][0-9]?):([0-9]+)$/.exec(outcome.target ?? '');
  const pair = target?.[2]?.split('/') ?? [];
  const attempt = s.yieldReturn?.find(
    (a) =>
      a.actor === performer?.id &&
      a.completedAt !== undefined &&
      a.target === `${pair.join('/')}:${target?.[3]}`,
  );
  const witness = s.settlement?.peer?.witnesses.find(
    (w) => w.disputeAt === Number(target?.[3]) && w.pair.join('/') === pair.join('/'),
  );
  const offered = inputs.some(
    (i) =>
      i.kind === 'offers.received' &&
      i.at === outcome.start &&
      i.payload.offers.some(
        (o) =>
          o.id === 'yield' && o.actionId === 'yield' && o.person === p.person && o.target === outcome.target,
      ),
  );
  if (
    !performer ||
    performer.id === v.id ||
    target?.[1] !== performer.id ||
    !pair.includes(v.id) ||
    !offered ||
    !attempt ||
    !witness
  )
    throw new Error('This resident has no matching completed partner Yield source.');
  return {
    ...role,
    kind: 'yield',
    sourceId: resolution.id,
    at: attempt!.completedAt!,
    digest: JSON.stringify([role.digest, resolution, pair]),
    text: 'You made room on the shared route. We could not both use that route at once.',
  };
}
export function publicVoiceOffer(
  s: State,
  c: PublicCommand,
): {
  facts: PublicFact[];
  lines: { speaker: string; text: string; sourceIds: string[] }[];
  map: Place;
  point: Point;
} {
  const keys = Object.keys(c);
  if (
    !['kind', 'ids', 'topic'].every((k) => keys.includes(k)) ||
    keys.some((k) => !['kind', 'ids', 'topic', 'sourceId'].includes(k)) ||
    !['role', 'work', 'yield', 'closing'].includes(c.topic) ||
    !Array.isArray(c.ids) ||
    c.ids.length < 1 ||
    c.ids.length > (c.topic === 'role' ? 2 : 1) ||
    new Set(c.ids).size !== c.ids.length ||
    (c.topic === 'role' ? c.sourceId !== undefined : typeof c.sourceId !== 'string')
  )
    throw new Error('Choose the matching current people and public source.');
  const people = c.ids.map((id) => {
    const v = s.villagers.find((x) => x.id === id);
    if (!v) throw new Error('Select a current resident.');
    return v;
  });
  const facts = people.map((v) => applicable(s, v, c));
  const first = people[0]!;
  return {
    facts,
    lines: facts.map((f) => ({ speaker: f.actor, text: f.text, sourceIds: [f.sourceId] })),
    map: s.settlement?.actors[first.id]?.map ?? 'yard',
    point: { x: first.x, y: first.y },
  };
}

export function closingCommand(s: State, id: string): PublicCommand {
  const v = s.villagers.find((v) => v.id === id);
  if (!v) throw new Error('Select a current resident.');
  const result =
    s.story?.firstResults.findLast((e) => e.actor === id) ??
    s.story?.events.findLast((e) => e.actor === id && !e.choice.startsWith('collaboration-'));
  return {
    kind: 'public-exchange',
    ids: [id],
    topic: 'closing',
    sourceId: result?.id ?? publicRole(s, v).sourceId,
  };
}
export function publicCommands(s: State, ids: string[]): { line: string; command: PublicCommand }[] {
  if (!ids.length || ids.length > 2 || ids.some((id) => !s.villagers.some((v) => v.id === id))) return [];
  const rows: { line: string; command: PublicCommand }[] = [
    {
      line:
        ids.length === 1
          ? 'About your work: invite a public introduction'
          : 'Talk about work: invite both public introductions',
      command: { kind: 'public-exchange', ids: [...ids], topic: 'role' },
    },
  ];
  if (ids.length === 1) {
    const id = ids[0]!;
    const index = s.inputs.findLastIndex(
      (i) =>
        'ids' in i.command &&
        i.command.ids.includes(id) &&
        ['order', 'build', 'settlement'].includes(i.command.kind),
    );
    if (index >= 0)
      rows.push({
        line: 'Ask about this work request',
        command: { kind: 'public-exchange', ids: [id], topic: 'work', sourceId: `input:${index}` },
      });
    if (s.continuedWorkshop || s.settlement?.storm)
      try {
        rows.push({ line: 'Ask for a closing word', command: closingCommand(s, id) });
      } catch {
        /* The public assignment has no approved outward words. */
      }
    if (s.yieldReturn?.some((a) => a.completedAt !== undefined)) {
      const v = s.villagers.find((v) => v.id === id)!;
      for (const t of readRunHistory(archiveCommunity(v.person)))
        for (const input of t.inputs)
          if (
            input.kind === 'action.resolved' &&
            input.payload.stage === 'finish' &&
            input.payload.outcome?.offerId === 'yield'
          ) {
            const command: PublicCommand = {
              kind: 'public-exchange',
              ids: [id],
              topic: 'yield',
              sourceId: input.id,
            };
            try {
              publicVoiceOffer(s, command);
              rows.push({ line: 'Invite a response to the completed Yield', command });
            } catch {
              /* A different actor, failed walk or pair is not this person's source. */
            }
          }
    }
  }
  return rows;
}
