import { validatePortablePerson } from '@adam0white/human-framework';
import {
  canonicalCast,
  canonicalPersona,
  type LifePreparation,
  lifeAdmission,
  type PersonaEnvelope,
  preparePersonaLife,
  projectCastClaimTransfer,
} from '@adam0white/lab-client';
import { CAST } from './cast';
import { FRAMEWORK_VERSION } from './engine';
import { admitRetained, inspectPortable, type Person, snapshot } from './hf4';
export const RULES = 'commonstead-4';
export const DIALECT = 'commonstead-retained/4';
export const MAPPING = 'commonstead-calendar/4';
export type Chapter = {
  version: typeof DIALECT;
  inputs: LifePreparation[];
  claims: PersonaEnvelope[];
  blocked?: { castId: string; reason: string }[];
  initial: Record<string, Person>;
};
const same = (a: unknown, b: unknown) => canonicalPersona(a) === canonicalPersona(b);
export function admitResident(input: LifePreparation, opening: Person): Person {
  const p = input.parent;
  if (p.source.game !== 'commonstead' || p.source.engine !== FRAMEWORK_VERSION || p.source.rules !== RULES)
    throw new Error(
      'This source cannot carry over into this Commonstead version. Keep the source save or start fresh.',
    );
  if (
    !CAST.some((c) => c.castId === p.castId) ||
    p.castId !== opening.id ||
    p.castRevision !== canonicalCast(p.castId).revision ||
    p.terminal ||
    !same(preparePersonaLife(p, input.clockMs).life, input.life)
  )
    throw new Error(
      'This resident history has an unsupported identity. Keep the source save or start a fresh chapter.',
    );
  if (p.transfer.castPassport !== DIALECT)
    throw new Error(
      'This older resident history needs a supported retained HF4 source. Keep the source save or start a fresh chapter.',
    );
  const portable = validatePortablePerson(p.transfer.portable);
  if (
    portable.version !== 2 ||
    portable.castId !== p.castId ||
    portable.castRevision !== p.castRevision ||
    portable.source.personId !== p.castId
  )
    throw new Error('This retained person does not match the resident. Keep the source save.');
  return admitRetained(opening, portable);
}
export function checkChapter(chapter: Chapter) {
  if (
    chapter.version !== DIALECT ||
    !Array.isArray(chapter.inputs) ||
    chapter.inputs.length > 8 ||
    !Array.isArray(chapter.claims) ||
    chapter.claims.length !== chapter.inputs.length ||
    (chapter.blocked !== undefined &&
      (!Array.isArray(chapter.blocked) ||
        chapter.blocked.length > CAST.length ||
        new Set(chapter.blocked.map((entry) => entry.castId)).size !== chapter.blocked.length ||
        chapter.blocked.some(
          (entry) =>
            !entry ||
            typeof entry.reason !== 'string' ||
            entry.reason.length > 500 ||
            !CAST.some((c) => c.castId === entry.castId) ||
            chapter.inputs.some((input) => input.parent.castId === entry.castId),
        ))) ||
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
      claim.source.engine !== FRAMEWORK_VERSION ||
      claim.source.rules !== RULES ||
      !same(
        claim.transfer,
        projectCastClaimTransfer(
          input.parent,
          claim.source,
          claimTransfer(chapter.initial, input),
          input.life,
        ),
      )
    )
      throw new Error(
        'The chapter’s saved resident record is invalid. Load a different save or start a fresh local chapter.',
      );
  }
}

export function claimTransfer(_initial: Record<string, Person>, input: LifePreparation) {
  return { ...input.parent.transfer, life: input.life };
}
export async function residentTransfer(person: Person) {
  const projection = inspectPortable(person, canonicalCast(person.id).revision);
  const entry = projection.people[0];
  if (entry?.kind !== 'host') throw new Error('Missing retained resident');
  const part = entry.parts.find((p) => p.select === 'persona');
  if (part?.select !== 'persona') throw new Error('Missing retained projection');
  return {
    raw: snapshot(person),
    transfer: { castPassport: DIALECT, sourceRole: person.id, portable: part.value },
    limitations: [
      'The complete Commonstead source archive remains with this chapter. Arrival preserves supported retained memory and duties; it does not imply healing or task completion.',
    ],
  };
}
export { lifeAdmission };
