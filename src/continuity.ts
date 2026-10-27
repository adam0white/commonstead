import { snapshot } from '@adam0white/human-framework';
import type { Lab, LifePreparation, PersonaEnvelope, PersonaLife } from '@adam0white/lab-client';
import {
  anchorPersonaLife,
  canonicalCast,
  claimCastChapterBatch,
  closePersonaBranch,
  createPersona,
  initialPersonaLife,
  PERSONA_ORIGINS,
  type personaChannel,
  projectPortablePerson,
  validatePersona,
} from '@adam0white/lab-client';
import { CAST } from './cast.ts';
import { admitResident, type Chapter, claimTransfer, DIALECT, RULES, residentTransfer } from './passport.ts';
import { PRESSURE } from './pressure.ts';
import type { SettlementConfig } from './settlement.ts';
import { apply, createGame, exportRun, importRun, type State } from './sim.ts';

type Shelf = ReturnType<typeof personaChannel>;
type SourceArchive = { revision: string; source: PersonaEnvelope['source']; snapshot: unknown };
export const LOCAL_KEY = 'commonstead-cast-local-v3';
const maxArchive = 1_000_000;

/** Run-scoped ownership, recording and source archive. No current shelf reads on local load. */
export class Continuity {
  generation = 0;
  heads: PersonaEnvelope[] = [];
  fileOrigin = false;
  playPaused = false;
  busy = false;
  status = 'New chapters check saved people automatically. Recording is a separate choice.';
  runId = crypto.randomUUID();
  sources: SourceArchive[] = [];
  private key = crypto.randomUUID();
  private operation = Promise.resolve();
  private state: State | null = null;
  constructor(
    readonly lab: Lab,
    readonly shelf: Shelf,
    readonly changed: () => void = () => {},
  ) {
    lab.setPersonaRecording(`startup-${this.key}`);
  }
  source(): PersonaEnvelope['source'] {
    return {
      game: 'commonstead',
      build: String(this.lab.build().c ?? 'local'),
      engine: '2.23.0',
      rules: RULES,
    };
  }
  invalidate() {
    this.generation++;
    this.key = crypto.randomUUID();
    this.lab.setPersonaRecording(this.key);
    this.changed();
  }
  /** Start before any file read or entry confirmation, including rejected selections. */
  beginEntry() {
    this.invalidate();
    return this.generation;
  }
  currentEntry(generation: number) {
    return generation === this.generation;
  }
  private requireEntry(generation: number) {
    if (!this.currentEntry(generation))
      throw new Error('The game changed while the entry was loading. Try loading it again.');
  }
  clear() {
    this.invalidate();
    this.state = null;
    this.heads = [];
    this.sources = [];
  }
  async fresh(
    seed: number,
    localOnly = false,
    config?: SettlementConfig,
    rules: typeof PRESSURE | null = PRESSURE,
    generation = this.beginEntry(),
  ) {
    this.requireEntry(generation);
    if (config) localOnly = true;
    if (this.busy)
      throw new Error('A chapter is already being prepared. Wait for it to finish before starting another.');
    this.busy = true;
    try {
      await this.shelf.ready;
      this.requireEntry(generation);
      // Host policy: ordinary new chapters use the public shelf automatically.
      // Admission, atomic ownership and the historical-edition guards remain SDK-owned.
      if (
        !localOnly &&
        !this.shelf.enabled &&
        (typeof location === 'undefined' || PERSONA_ORIGINS.has(location.origin))
      ) {
        this.shelf.setEnabled(true);
        await this.shelf.ready;
      }
      if (generation !== this.generation)
        throw new Error('The game changed before the residents could join. Try starting the chapter again.');
      const base = createGame(seed);
      let chapter: Chapter | undefined;
      if (this.shelf.enabled && !localOnly) {
        const result = await claimCastChapterBatch(
          this.shelf,
          CAST.map((c) => c.castId),
          this.source(),
          async (inputs: LifePreparation[]) => {
            const initial = Object.fromEntries(
              base.villagers.map((v) => [v.person.id, structuredClone(v.person)]),
            );
            for (const input of inputs) {
              const opening = initial[input.parent.castId];
              if (!opening)
                throw new Error(
                  'This person is not in the Commonstead resident list. Start a fresh local chapter.',
                );
              initial[input.parent.castId] = admitResident(input, opening);
            }
            return initial;
          },
          { isCurrent: () => generation === this.generation, claimTransfer },
        );
        if (result)
          chapter = {
            version: DIALECT,
            initial: result.initial,
            inputs: result.inputs,
            claims: result.claims,
          };
      }
      if (generation !== this.generation)
        throw new Error(
          'The game changed while the chapter was being prepared. No new chapter started. Try starting it again.',
        );
      // The default short chapter plays under the pressure rules; longer days keep their editions.
      const state = createGame(seed, chapter, config, config || !rules ? undefined : rules);
      this.state = state;
      this.runId = crypto.randomUUID();
      this.sources = [];
      this.heads = chapter?.claims ?? [];
      this.fileOrigin = false;
      this.status = chapter
        ? `This chapter carries over ${chapter.inputs.length} supported histories. All residents were checked together. The other residents begin with their original histories.`
        : localOnly
          ? 'You started a fresh local chapter. Saved browser histories have not changed.'
          : 'You started a fresh chapter with the residents’ original histories. No saved histories were carried over.';
      // Caller installs the prepared state before opening any recording hook.
      return state;
    } finally {
      this.busy = false;
    }
  }
  async validateRunEnvelopes(state: State) {
    await validateRunEnvelopes(state);
  }

  async loadLocal(text: string, generation = this.beginEntry()) {
    this.requireEntry(generation);
    const saved = JSON.parse(text);
    const state = importRun(saved.run);
    if (state.shortYield || state.roofBreak) validateYieldSources(saved.sources);
    await this.validateRunEnvelopes(state);
    if (
      typeof saved.runId !== 'string' ||
      typeof saved.fileOrigin !== 'boolean' ||
      !Array.isArray(saved.heads) ||
      saved.heads.length > 8 ||
      !Array.isArray(saved.sources) ||
      JSON.stringify(saved.sources).length > maxArchive
    )
      throw new Error(
        'This local save has invalid records of saved residents or their source data. Start a fresh chapter.',
      );
    const heads = await Promise.all(saved.heads.map((p: unknown) => validatePersona(p)));
    if (
      new Set(heads.map((p) => p.castId)).size !== heads.length ||
      heads.some(
        (p) =>
          !CAST.some((c) => c.castId === p.castId) ||
          p.source.game !== 'commonstead' ||
          p.source.rules !== RULES ||
          !(
            state.chapter?.claims.some((c) => c.revision === p.revision) || p.transfer.hostRun === saved.runId
          ),
      )
    )
      throw new Error(
        'The saved resident records belong to another game. Load a different save or start a fresh chapter.',
      );
    if (generation !== this.generation)
      throw new Error('The game changed while the save was loading. Try loading it again.');
    if (state.shortYield && typeof saved.playPaused !== 'boolean')
      throw new Error('Missing saved pause boundary');
    this.state = state;
    this.runId = saved.runId;
    this.heads = heads;
    this.fileOrigin = saved.fileOrigin;
    this.sources = saved.sources;
    this.playPaused = state.shortYield ? saved.playPaused : false;
    this.status =
      'The local chapter has loaded with the residents and saved resident records it used before. It has not loaded newer browser histories.';
    return state;
  }
  async importFile(text: string, generation = this.beginEntry()) {
    this.requireEntry(generation);
    const raw = JSON.parse(text);
    const { castSources: archiveSources, ...native } = raw;
    const state = importRun([7, 8, 9].includes(raw.schema) ? native : raw);
    if (raw.schema === 7 || raw.schema === 9) validateYieldSources(archiveSources ?? []);
    await this.validateRunEnvelopes(state);
    const sources = raw.castSources ?? [];
    if (!Array.isArray(sources) || JSON.stringify(sources).length > maxArchive)
      throw new Error(
        'The file contains too much saved source data. Load a smaller file or start a fresh chapter.',
      );
    if (generation !== this.generation)
      throw new Error('The game changed while the file was loading. Try loading it again.');
    this.state = state;
    this.heads = [];
    this.runId = crypto.randomUUID();
    this.sources = sources;
    this.playPaused = false;
    this.fileOrigin = true;
    this.status =
      'This game was loaded from a file. It does not take control of any saved resident histories in the file. Your menu choice controls recording and automatic links between games.';
    return state;
  }
  localSave(state: State, playPaused = false) {
    return JSON.stringify({
      run: exportRun(state),
      ...(state.shortYield ? { playPaused } : {}),
      runId: this.runId,
      fileOrigin: this.fileOrigin,
      heads: this.heads,
      sources: this.sources,
    });
  }
  export(state: State) {
    if (
      state.settlement?.config.edition === 'settlement-replies/1' ||
      state.settlement?.config.edition === 'settlement-replies/2'
    )
      return exportRun(state) as object;
    return { ...(exportRun(state) as object), castSources: structuredClone(this.sources) };
  }
  pinnedHistories() {
    const group = new Map((this.state?.chapter?.claims ?? []).map((p) => [`${p.castId}/${p.branchId}`, p]));
    for (const p of this.heads) group.set(`${p.castId}/${p.branchId}`, p);
    return [...group.values()].sort((a, b) =>
      `${a.castId}/${a.branchId}`.localeCompare(`${b.castId}/${b.branchId}`),
    );
  }

  /** Legacy binding only. Recording and linkage follow the shared menu preference. */
  async recording(_allow = false, generation = this.generation) {
    if (!this.currentEntry(generation)) return;
    this.lab.setPersonaRecording(this.key);
  }
  async deny() {
    // Historical callers cannot create a separate continuing-person recording choice.
  }

  async setEnabled(value: boolean) {
    this.invalidate();
    await this.shelf.ready;
    this.shelf.setEnabled(value);
    this.status =
      'You changed whether people continue between games. This chapter keeps its current residents. Only a new chapter can load saved browser histories.';
  }
  checkpoint(castId: string, fork = false) {
    const generation = this.generation,
      state = this.state,
      runId = this.runId;
    const task = this.operation.then(async () => {
      if (state?.roofBreak)
        throw new Error(
          'People from this recorded roof-break day cannot move to another game yet. Download the complete run to keep this day and its source history.',
        );
      if (state?.shortYield)
        throw new Error(
          'People from this yielded short day cannot move to another game yet. Download the run to keep this day.',
        );
      const current = () =>
        !state?.shortYield &&
        !state?.roofBreak &&
        generation === this.generation &&
        state === this.state &&
        runId === this.runId;
      if (
        !state ||
        !current() ||
        !state.inputs.some(
          (input) => input.command.kind !== 'pause-chapter' && input.command.kind !== 'resume-chapter',
        ) ||
        state.tick === 0 ||
        (!state.chapterPaused &&
          state.villagers.find((v) => v.person.id === castId)?.person.body.alive !== false)
      )
        throw new Error(
          'Play the chapter first. Then pause it and wait for current actions to finish before saving a person.',
        );
      if (state.settlement)
        throw new Error(
          'People from this longer day cannot move to another game yet. Download the run to keep this day.',
        );
      if (this.fileOrigin) throw new Error('File play cannot publish people.');
      await this.shelf.ready;
      if (!current() || !this.shelf.enabled)
        throw new Error(
          'Saving people between games is off, or the game has changed. Check the setting and try saving the person again.',
        );
      const villager = state.villagers.find((v) => v.person.id === castId);
      if (!villager || !CAST.some((c) => c.castId === castId))
        throw new Error('This person is not a Commonstead resident. Choose someone from the resident list.');
      const parent = this.heads.find((p) => p.castId === castId);
      let envelope: PersonaEnvelope;
      let raw: unknown;
      if (!villager.person.body.alive) {
        if (!parent)
          throw new Error(
            'This game has no saved living history for this person that it can close. Keep a copy by downloading the game.',
          );
        if (parent.terminal) return;
        raw = snapshot(villager.person);
        const closed = await closePersonaBranch(parent, this.source(), villager.person.now);
        const { revision: _revision, ...body } = closed;
        envelope = await createPersona({ ...body, transfer: { ...body.transfer, hostRun: runId } });
      } else {
        if (villager.order && state.buildings.some((b) => b.id === villager.order?.target && !b.complete))
          throw new Error(
            'This resident still has shared building work to finish. Finish it before the resident leaves.',
          );
        const captured =
          castId === 'hf.cast.burak.stairwell'
            ? {
                raw: snapshot(villager.person),
                transfer: projectPortablePerson({
                  castId,
                  game: 'commonstead',
                  engine: '2.23.0',
                  person: villager.person,
                  history: [`Played a Commonstead chapter to tick ${state.tick}.`],
                  previous: parent,
                  hostObligations: [],
                }),
                limitations: ['The complete Commonstead chapter remains in the local source archive.'],
              }
            : await residentTransfer(villager.person);
        raw = captured.raw;
        const branchId = fork ? crypto.randomUUID() : (parent?.branchId ?? crypto.randomUUID());
        const life =
          !fork && parent?.transfer.life
            ? anchorPersonaLife(parent.transfer.life as PersonaLife, castId, Date.now())
            : initialPersonaLife(castId, branchId, Date.now());
        envelope = await createPersona({
          format: 'hf-persona/1',
          castId,
          castRevision: canonicalCast(castId).revision,
          branchId,
          parentRevision: fork ? null : (parent?.revision ?? null),
          source: this.source(),
          transfer: { ...captured.transfer, life, hostRun: runId },
          limitations: captured.limitations,
        });
      }
      if (!current())
        throw new Error('The game changed before the person could be saved. Try saving the person again.');
      // Preserve full actual source before publication, including failed CAS attempts, local only.
      if (raw) {
        const retained = [
          ...this.sources,
          { revision: envelope.revision, source: envelope.source, snapshot: raw },
        ];
        // Capacity is serialized JSON UTF16 code units, as in the native loader.
        if (retained.length > 100 || JSON.stringify(retained).length > maxArchive)
          throw new Error(
            'Complete source archive exceeds capacity. Download this run. This history was not published.',
          );
        this.sources = retained;
        this.changed();
      }
      if (!current())
        throw new Error('The game changed before the person could be saved. Try saving the person again.');
      await this.shelf.request({
        action: 'put',
        envelope,
        fork,
        authored: !fork && !parent && !this.fileOrigin && !state.chapter?.inputs.length,
      });
      if (!current()) return;
      this.heads = [...this.heads.filter((p) => p.castId !== castId), envelope].sort((a, b) =>
        a.castId.localeCompare(b.castId),
      );
      this.key = crypto.randomUUID();
      this.lab.setPersonaRecording(this.key);
      this.status = `${villager.name}: ${envelope.terminal ? 'The end of this person’s history has been saved.' : 'This person’s current history has been saved.'} Details that cannot carry over remain in the local game data and are included when you download the game file.`;
      this.changed();
      if (current()) await this.recording();
    });
    this.operation = task.catch(() => {});
    return task;
  }
  async checkpointAll() {
    if (this.fileOrigin) return;
    const generation = this.generation,
      state = this.state,
      runId = this.runId;
    const current = () => generation === this.generation && state === this.state && runId === this.runId;
    for (const c of CAST) {
      if (!current()) return;
      try {
        await this.checkpoint(c.castId);
      } catch (error) {
        if (!current()) return;
        this.status = String(error);
      }
    }
    if (current()) this.changed();
  }
}

/** Only browser-person continuity changes cancel a pending chapter. Recording does not. */
export function watchShelfPreference(invalidate: () => void, events: EventTarget = window): () => void {
  const stored = (event: Event) => {
    const key = (event as StorageEvent).key;
    if (key === null || key === 'hf-persona-opt-in') invalidate();
  };
  events.addEventListener('hf-persona-preference', invalidate);
  events.addEventListener('storage', stored);
  return () => {
    events.removeEventListener('hf-persona-preference', invalidate);
    events.removeEventListener('storage', stored);
  };
}

/** Resume historical departure pauses through a replayed command, never by changing flags. */
export function resumeForPlay(state: State) {
  if (!state.shortYield && !state.ended && (state.chapterPaused || state.pauseRequested))
    apply(state, { kind: 'resume-chapter' });
}

export function validateYieldSources(raw: unknown): void {
  const keys = (value: unknown, required: string[]) => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== required.length ||
      required.some((k) => !Object.hasOwn(value, k))
    )
      throw new Error('Invalid source archive');
  };
  if (!Array.isArray(raw) || raw.length > 100 || JSON.stringify(raw).length > maxArchive)
    throw new Error('Invalid source archive bounds');
  for (const source of raw) {
    keys(source, ['revision', 'source', 'snapshot']);
    keys(source.source, ['game', 'build', 'engine', 'rules']);
    if (
      typeof source.revision !== 'string' ||
      source.revision.length > 200 ||
      Object.values(source.source).some((v) => typeof v !== 'string' || v.length > 500)
    )
      throw new Error('Invalid source provenance');
    const safe = (value: unknown, depth = 0): void => {
      if (depth > 100) throw new Error('Source nesting limit');
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid source number');
      if (value && typeof value === 'object')
        for (const [key, child] of Object.entries(value)) {
          if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe source key');
          safe(child, depth + 1);
        }
    };
    safe(source.snapshot);
  }
}

/** Pure validation shared by native and memory-only entries. */
export async function validateRunEnvelopes(state: State) {
  if (state.chapter)
    await Promise.all(
      [...state.chapter.claims, ...state.chapter.inputs.map((i) => i.parent)].map((p) => validatePersona(p)),
    );
}
