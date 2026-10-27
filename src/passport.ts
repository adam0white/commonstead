import {
  admitCalendarPersona,
  DEFAULT_NORMS,
  isContinuingCommitment,
  type Person,
  projectCalendarPersona,
  restore,
  snapshot,
  validateCalendarPersona,
} from '@adam0white/human-framework';
import {
  admitPortablePerson,
  canonicalCast,
  canonicalPersona,
  type LifePreparation,
  lifeAdmission,
  type PersonaEnvelope,
  portablePassport,
  preparePersonaLife,
  projectPortablePerson,
} from '@adam0white/lab-client';
import { CAST } from './cast.ts';

export const RULES = 'commonstead-3';
export const DIALECT = 'commonstead-cast/1';
export const MAPPING = 'commonstead-calendar/1';
export type Chapter = {
  version: typeof DIALECT;
  inputs: LifePreparation[];
  claims: PersonaEnvelope[];
  initial: Record<string, Person>;
};
const same = (a: unknown, b: unknown) => canonicalPersona(a) === canonicalPersona(b);
const identity = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, key]));
// Only these released engines share the finite calendar dialects below.
const supportedEngine = (engine: string) => engine === '2.17.0' || engine === '2.21.0' || engine === '2.23.0';
const BURAK = 'hf.cast.burak.stairwell';
const supportedActions = new Set(['rest', 'eat', 'drink']);

/** Finite Small Works Nora/Sam, native Commonstead and exact native/forwarded Glance Nerys maps. No clinical or duty waiver. */
export function admitResident(input: LifePreparation, opening: Person): Person {
  const p = input.parent;
  const cast = canonicalCast(p.castId);
  if (
    !CAST.some((c) => c.castId === p.castId) ||
    p.castId !== opening.id ||
    p.castRevision !== cast.revision ||
    p.terminal ||
    (!portablePassport(p) && !supportedEngine(p.source.engine))
  )
    throw new Error(
      'This resident history has an unsupported identity or version, or it has ended. Start a fresh local chapter.',
    );
  if (!same(preparePersonaLife(p, input.clockMs).life, input.life))
    throw new Error(
      'This resident’s saved life history does not match the expected history. Start a fresh local chapter.',
    );
  if (portablePassport(p)) {
    if (p.castId !== BURAK) throw new Error('This resident has no supported portable chapter here.');
    return admitPortablePerson(p, 'commonstead', opening);
  }
  const peerRole =
    p.castId === 'hf.cast.nora.smallworks' ? 'nora' : p.castId === 'hf.cast.sam.smallworks' ? 'sam' : null;
  const peer =
    (p.source.game === 'repair' || (p.source.game === 'commonstead' && p.source.rules === RULES)) &&
    p.transfer.castPassport === 'workshop-cast/1' &&
    peerRole &&
    p.transfer.sourceRole === peerRole;
  // Glance's verified claim retains Nerys's original Commonstead passport unchanged.
  const forwardedNerys =
    p.castId === 'hf.cast.nerys.glance' &&
    p.source.game === 'glance' &&
    p.source.rules === 'glance-3' &&
    (p.source.engine === '2.17.0' || p.source.engine === '2.21.0');
  // Glance4's actual native Nerys passport, including an own claim retaining it.
  const glanceNerys =
    p.castId === 'hf.cast.nerys.glance' &&
    p.source.engine === '2.23.0' &&
    ((p.source.game === 'glance' && p.source.rules === 'glance-4') ||
      (p.source.game === 'commonstead' && p.source.rules === RULES)) &&
    p.transfer.castPassport === 'glance-cast/1' &&
    p.transfer.sourceRole === 'nerys';
  const native =
    (p.source.game === 'commonstead' || forwardedNerys) &&
    p.transfer.castPassport === DIALECT &&
    p.transfer.sourceRole === p.castId;
  const currentCommonstead = p.source.game === 'commonstead' && p.source.rules === RULES;
  if (
    (!peer && !native && !glanceNerys) ||
    (p.source.engine === '2.23.0' && !currentCommonstead && !glanceNerys)
  )
    throw new Error(
      'Commonstead cannot carry over a resident history from this source. Download the source game to keep a copy, or start a fresh local chapter.',
    );
  const portable = validateCalendarPersona(p.transfer.person);
  const sourceId = peer ? String(peerRole) : glanceNerys ? 'nerys' : p.castId;
  const mapping = peer ? 'workshop-calendar/1' : glanceNerys ? 'glance-calendar/1' : MAPPING;
  if (
    portable.person.mappingVersion !== mapping ||
    portable.person.source.id !== sourceId ||
    !supportedEngine(portable.person.source.engine) ||
    (glanceNerys && portable.person.source.engine !== '2.23.0') ||
    (peer &&
      p.source.engine === '2.23.0' &&
      portable.person.source.engine !== '2.17.0' &&
      portable.person.source.engine !== '2.21.0') ||
    portable.person.name !== cast.name
  )
    throw new Error(
      'This resident history does not match the required role, transfer format, simulation version or name. Start a fresh local chapter.',
    );
  const receipt = p.transfer.checkpoint as Record<string, unknown> | undefined;
  if (
    !receipt ||
    receipt.schema !== portable.person.source.schema ||
    receipt.sourceMinute !== portable.person.source.now ||
    !same(receipt.rng, portable.person.rng) ||
    typeof receipt.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(receipt.sha256)
  )
    throw new Error(
      'This resident history has no valid record of the complete source save. Save the person again in the source game, or start a fresh local chapter.',
    );
  if (portable.calendar.norms.some((norm) => !DEFAULT_NORMS.some((known) => same(known, norm))))
    throw new Error(
      'Commonstead cannot interpret some rules in this resident history. Keep the history in its source game, or start a fresh local chapter.',
    );
  if (
    [...portable.calendar.commitments, ...portable.calendar.owed].some((c) =>
      [...c.actions, ...(c.violatedBy ?? [])].some((a) => !supportedActions.has(a)),
    )
  )
    throw new Error(
      'This person has an obligation from another game that Commonstead cannot support. Keep the person in that game, or start a fresh local chapter.',
    );
  const target = restore(snapshot(opening));
  const shifted = structuredClone(portable);
  const offset = target.now - portable.person.source.now;
  shifted.calendar.offset = offset;
  for (const c of shifted.calendar.commitments) {
    c.from += offset;
    c.until += offset;
    if (c.recurUntil !== undefined) c.recurUntil += offset;
    if (c.exempt) c.exempt.at += offset;
  }
  for (const d of shifted.calendar.owed) {
    d.at += offset;
    if (d.lapseSince !== undefined) d.lapseSince += offset;
  }
  if (shifted.calendar.lapse) shifted.calendar.lapse.since += offset;
  const age = portable.person.source.now - portable.person.life.bornAt;
  if (age < cast.age * 525600)
    throw new Error(
      'This resident history gives an age below the resident’s original age. Start a fresh local chapter.',
    );
  target.life.bornAt = portable.person.life.bornAt + offset;
  target.body.fitness = portable.person.health.fitness;
  target.body.circadianPeak = portable.person.health.circadianPeak;
  // Retain health only through HF's strict compatible-body check; never heal a source condition.
  if (peer) {
    const skills = Object.keys(shifted.person.skills);
    shifted.person.skills = {};
    if (skills.length)
      shifted.person.limitations.push(
        `These repair skills remain in the saved source data: ${skills.join(', ')}. They do not count as qualifications in this workshop.`,
      );
  }
  return admitCalendarPersona(shifted, target, {
    mappingVersion: mapping,
    sourceId,
    targetId: p.castId,
    targetNorms: DEFAULT_NORMS,
  }).person;
}

export function checkChapter(chapter: Chapter) {
  if (
    chapter.version !== DIALECT ||
    !Array.isArray(chapter.inputs) ||
    chapter.inputs.length > 8 ||
    !Array.isArray(chapter.claims) ||
    chapter.claims.length !== chapter.inputs.length ||
    new Set(chapter.inputs.map((i) => i.parent.castId)).size !== chapter.inputs.length ||
    !same(Object.keys(chapter.initial).sort(), CAST.map((c) => c.castId).sort())
  )
    throw new Error(
      'The chapter’s starting resident list is invalid. Load a different save or start a fresh local chapter.',
    );
  for (const input of chapter.inputs) {
    const claim = chapter.claims.find((p) => p.castId === input.parent.castId);
    if (
      !claim ||
      claim.terminal ||
      claim.castRevision !== input.parent.castRevision ||
      claim.branchId !== input.parent.branchId ||
      claim.parentRevision !== input.parent.revision ||
      claim.source.game !== 'commonstead' ||
      claim.source.engine !== '2.23.0' ||
      claim.source.rules !== RULES ||
      !same(claim.transfer, claimTransfer(chapter.initial, input))
    )
      throw new Error(
        'The chapter’s saved resident record is invalid. Load a different save or start a fresh local chapter.',
      );
  }
}

/** Project the admitted actor, so a claim never repeats a stale source state. */
export function claimTransfer(initial: Record<string, Person>, input: LifePreparation) {
  if (!portablePassport(input.parent)) return { ...input.parent.transfer, life: input.life };
  const person = initial[input.parent.castId];
  if (!person || person.id !== BURAK)
    throw new Error('This resident has no supported portable chapter here.');
  return {
    ...projectPortablePerson({
      castId: person.id,
      game: 'commonstead',
      engine: '2.23.0',
      person,
      history: [],
      previous: input.parent,
    }),
    life: input.life,
  };
}

/** Capture an actual idle boundary. Full source stays local; shelf carries only finite projection. */
export async function residentTransfer(person: Person) {
  const retained = person.agenda.commitments.filter((c) => isContinuingCommitment(person.agenda, c));
  const owed = person.agenda.owed ?? [];
  const projection = projectCalendarPersona(person, {
    version: MAPPING,
    skills: identity(Object.keys(person.skills)),
    calendar: {
      version: 'hf-persona-calendar-map/1',
      offset: 0,
      sourceNorms: DEFAULT_NORMS,
      references: {
        commitments: identity([
          ...retained.flatMap((c) => [c.id, ...(c.makeUpOf ? [c.makeUpOf] : [])]),
          ...owed.flatMap((d) => [d.ofId, ...(d.scheduledAs ? [d.scheduledAs] : [])]),
        ]),
        chains: identity(retained.flatMap((c) => (c.chain ? [c.chain] : []))),
        actions: identity([
          ...retained.flatMap((c) => [...c.actions, ...(c.violatedBy ?? [])]),
          ...owed.flatMap((d) => [...d.actions, ...(d.violatedBy ?? [])]),
        ]),
        entities: identity(retained.flatMap((c) => [c.toId, c.targetId].filter((x): x is string => !!x))),
        norms: identity(DEFAULT_NORMS.map((n) => n.id)),
      },
    },
  });
  const raw = snapshot(person);
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPersona(raw)))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  return {
    raw,
    transfer: {
      castPassport: DIALECT,
      sourceRole: person.id,
      person: projection,
      checkpoint: {
        schema: person.schema,
        sourceMinute: person.now,
        rng: structuredClone(person.rng),
        sha256,
      },
    },
    limitations: [
      ...projection.person.limitations,
      'The complete source save keeps the layout, supplies, shared building work, story discoveries, social memories and temporary physical states and needs from that game. Transferring the calendar takes no simulation time. It does not count as travel, healing, payment or a qualification.',
    ],
  };
}
export { lifeAdmission };
