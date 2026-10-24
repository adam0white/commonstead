import { snapshot } from '@adam0white/human-framework';
import type { Lab, LifePreparation, PersonaEnvelope, PersonaLife } from '@adam0white/lab-client';
import {
  anchorPersonaLife,
  canonicalCast,
  claimCastChapterBatch,
  closePersonaBranch,
  createPersona,
  initialPersonaLife,
  type personaChannel,
  validatePersona,
} from '@adam0white/lab-client';
import { CAST } from './cast.ts';
import { admitResident, type Chapter, DIALECT, RULES, residentTransfer } from './passport.ts';
import { createGame, exportRun, importRun, type State } from './sim.ts';

type Shelf = ReturnType<typeof personaChannel>;
type SourceArchive = { revision: string; source: PersonaEnvelope['source']; snapshot: unknown };
export const LOCAL_KEY = 'commonstead-cast-local-v3';
const maxArchive = 1_000_000;

/** Run-scoped ownership, recording and source archive. No current shelf reads on local load. */
export class Continuity {
  generation = 0;
  heads: PersonaEnvelope[] = [];
  fileOrigin = false;
  busy = false;
  status = 'Browser continuity and lab recording are separate choices.';
  runId = crypto.randomUUID();
  sources: SourceArchive[] = [];
  private fileAllowed = false;
  private denied = false;
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
      engine: '2.17.0',
      rules: RULES,
    };
  }
  invalidate() {
    this.generation++;
    this.fileAllowed = false;
    this.denied = true;
    this.key = crypto.randomUUID();
    this.lab.setPersonaRecording(this.key);
    this.changed();
  }
  clear() {
    this.invalidate();
    this.state = null;
    this.heads = [];
    this.sources = [];
  }
  async fresh(seed: number, localOnly = false) {
    if (this.busy) throw new Error('A chapter is already being prepared.');
    this.busy = true;
    this.invalidate();
    const generation = this.generation;
    try {
      await this.shelf.ready;
      if (generation !== this.generation) throw new Error('Run changed before admission.');
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
              if (!opening) throw new Error('Unallocated person.');
              initial[input.parent.castId] = admitResident(input, opening);
            }
            return initial;
          },
          { isCurrent: () => generation === this.generation },
        );
        if (result)
          chapter = {
            version: DIALECT,
            initial: result.initial,
            inputs: result.inputs,
            claims: result.claims,
          };
      }
      if (generation !== this.generation) throw new Error('Run changed. No late chapter started.');
      const state = createGame(seed, chapter);
      this.state = state;
      this.runId = crypto.randomUUID();
      this.sources = [];
      this.heads = chapter?.claims ?? [];
      this.fileOrigin = false;
      this.fileAllowed = false;
      this.denied = false;
      this.status = chapter
        ? `Admitted ${chapter.inputs.length} applicable histories in one atomic whole-allocation claim. Other residents are canonical fresh openings.`
        : localOnly
          ? 'Explicit fresh local chapter; browser histories are untouched.'
          : 'Canonical fresh chapter; no carried histories.';
      // Caller installs the prepared state before opening any recording hook.
      return state;
    } finally {
      this.busy = false;
    }
  }
  async validateRunEnvelopes(state: State) {
    if (state.chapter)
      await Promise.all(
        [...state.chapter.claims, ...state.chapter.inputs.map((i) => i.parent)].map((p) =>
          validatePersona(p),
        ),
      );
  }
  async loadLocal(text: string) {
    this.invalidate();
    const generation = this.generation;
    const saved = JSON.parse(text);
    const state = importRun(saved.run);
    await this.validateRunEnvelopes(state);
    if (
      typeof saved.runId !== 'string' ||
      typeof saved.fileOrigin !== 'boolean' ||
      !Array.isArray(saved.heads) ||
      saved.heads.length > 8 ||
      !Array.isArray(saved.sources) ||
      JSON.stringify(saved.sources).length > maxArchive
    )
      throw new Error('Invalid local ownership/archive wrapper. Start fresh.');
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
      throw new Error('Ownership receipt belongs to another run.');
    if (generation !== this.generation) throw new Error('Run changed during load.');
    this.state = state;
    this.runId = saved.runId;
    this.heads = heads;
    this.fileOrigin = saved.fileOrigin;
    this.sources = saved.sources;
    this.denied = false;
    this.status =
      'Local chapter restored from pinned actors and exact last accepted ownership receipts. No newer shelf state loaded.';
    return state;
  }
  async importFile(text: string) {
    this.invalidate();
    const generation = this.generation;
    const raw = JSON.parse(text);
    const state = importRun(raw);
    await this.validateRunEnvelopes(state);
    const sources = raw.castSources ?? [];
    if (!Array.isArray(sources) || JSON.stringify(sources).length > maxArchive)
      throw new Error('Source archive is too large.');
    if (generation !== this.generation) throw new Error('Run changed during import.');
    this.state = state;
    this.heads = [];
    this.runId = crypto.randomUUID();
    this.sources = sources;
    this.fileOrigin = true;
    this.denied = false;
    this.status =
      'File-origin run: no embedded ownership is acquired. Local play/export work; recording needs this run’s explicit choice.';
    return state;
  }
  localSave(state: State) {
    return JSON.stringify({
      run: exportRun(state),
      runId: this.runId,
      fileOrigin: this.fileOrigin,
      heads: this.heads,
      sources: this.sources,
    });
  }
  export(state: State) {
    return { ...(exportRun(state) as object), castSources: structuredClone(this.sources) };
  }
  pinnedHistories() {
    const group = new Map((this.state?.chapter?.claims ?? []).map((p) => [`${p.castId}/${p.branchId}`, p]));
    for (const p of this.heads) group.set(`${p.castId}/${p.branchId}`, p);
    return [...group.values()].sort((a, b) =>
      `${a.castId}/${a.branchId}`.localeCompare(`${b.castId}/${b.branchId}`),
    );
  }

  private recordingBatches(pinned: PersonaEnvelope[]) {
    const batches: PersonaEnvelope[][] = [];
    for (const p of pinned) {
      let batch = batches.find((b) => b.length < 8 && !b.some((other) => other.castId === p.castId));
      if (!batch) {
        batch = [];
        batches.push(batch);
      }
      batch.push(p);
    }
    return batches;
  }
  async recording(allow = false) {
    if (allow) {
      this.invalidate();
      this.denied = false;
      this.fileAllowed = this.fileOrigin;
    }
    const generation = this.generation;
    const pinned = structuredClone(this.pinnedHistories());
    const revisions = pinned.map((p) => p.revision).join('/');
    const current = () =>
      generation === this.generation &&
      revisions ===
        this.pinnedHistories()
          .map((p) => p.revision)
          .join('/');
    this.lab.setPersonaRecording(this.key);
    if (this.denied || (this.fileOrigin && !this.fileAllowed)) return;
    if (!pinned.length) {
      if (this.fileOrigin) {
        if (allow && current()) this.lab.allowPersonaRecording(true);
      } else this.lab.setPersonaRecording(null);
      return;
    }
    await this.shelf.ready;
    if (!this.shelf.enabled || !current()) return;
    let allPermitted = true;
    let attemptEpoch: string | undefined;
    // The published bridge permits one envelope per cast ID in a batch. Explicit forks can
    // leave two historical branches for a person; every batch must pass before opening the gate.
    for (const batch of this.recordingBatches(pinned)) {
      const selected = batch.map((p) => p.revision).join('/');
      const query = await this.shelf.request<{
        sameEpoch: boolean;
        revisions: string[];
        recordingEpoch: string | null;
      }>({ action: 'recordingBatch', envelopes: batch });
      if (!current() || query.revisions.join('/') !== selected || !query.recordingEpoch) return;
      if (attemptEpoch !== undefined && query.recordingEpoch !== attemptEpoch) return;
      attemptEpoch = query.recordingEpoch;
      if (allow) {
        const accepted = await this.shelf.request<{
          sameEpoch: boolean;
          revisions: string[];
          recordingEpoch: string | null;
        }>({
          action: 'recordingBatch',
          envelopes: batch,
          allowRecording: true,
          recordingEpoch: query.recordingEpoch ?? undefined,
        });
        if (
          !current() ||
          accepted.revisions.join('/') !== selected ||
          accepted.recordingEpoch !== attemptEpoch
        )
          return;
        allPermitted = allPermitted && accepted.sameEpoch;
      } else allPermitted = allPermitted && query.sameEpoch;
    }
    if (current()) this.lab.allowPersonaRecording(allPermitted);
  }

  async deny() {
    this.invalidate();
    this.status = 'Recording declined for this history. Local play and exports remain available.';
    const generation = this.generation,
      pinned = structuredClone(this.pinnedHistories());
    if (!pinned.length) return;
    await this.shelf.ready;
    if (!this.shelf.enabled || generation !== this.generation) return;
    for (const batch of this.recordingBatches(pinned)) {
      const query = await this.shelf.request<{ recordingEpoch: string | null }>({
        action: 'recordingBatch',
        envelopes: batch,
      });
      if (generation !== this.generation) return;
      await this.shelf.request({
        action: 'recordingBatch',
        envelopes: batch,
        allowRecording: false,
        recordingEpoch: query.recordingEpoch ?? undefined,
      });
      if (generation !== this.generation) return;
    }
  }

  async setEnabled(value: boolean) {
    this.invalidate();
    await this.shelf.ready;
    this.shelf.setEnabled(value);
    this.status =
      'Continuity choice changed. This loaded chapter stays pinned; only a new chapter admits browser histories.';
  }
  checkpoint(castId: string, fork = false) {
    const generation = this.generation,
      state = this.state,
      runId = this.runId;
    const task = this.operation.then(async () => {
      const current = () => generation === this.generation && state === this.state && runId === this.runId;
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
          'Play, then pause this chapter at its real action boundaries before saving a person.',
        );
      await this.shelf.ready;
      if (!current() || !this.shelf.enabled) throw new Error('Continuity is off or run changed.');
      const villager = state.villagers.find((v) => v.person.id === castId);
      if (!villager || !CAST.some((c) => c.castId === castId)) throw new Error('Not an allocated resident.');
      const parent = this.heads.find((p) => p.castId === castId);
      let envelope: PersonaEnvelope;
      let raw: unknown;
      if (!villager.person.body.alive) {
        if (!parent) throw new Error('No owned living branch to close.');
        if (parent.terminal) return;
        raw = snapshot(villager.person);
        const closed = await closePersonaBranch(parent, this.source(), villager.person.now);
        const { revision: _revision, ...body } = closed;
        envelope = await createPersona({ ...body, transfer: { ...body.transfer, hostRun: runId } });
      } else {
        if (villager.order && state.buildings.some((b) => b.id === villager.order?.target && !b.complete))
          throw new Error(
            'This resident still has unfinished shared assembly work. Finish it before departure.',
          );
        const captured = await residentTransfer(villager.person);
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
      if (!current()) throw new Error('Run changed before checkpoint.');
      // Preserve full actual source before publication, including failed CAS attempts, local only.
      if (raw) {
        this.sources.push({ revision: envelope.revision, source: envelope.source, snapshot: raw });
        while (JSON.stringify(this.sources).length > maxArchive) this.sources.shift();
        this.changed();
      }
      const epoch = await this.shelf.request<{ recordingEpoch: string | null }>({ action: 'recording' });
      if (!current()) throw new Error('Identity changed before checkpoint.');
      await this.shelf.request({
        action: 'put',
        envelope,
        fork,
        authored: !fork && !parent && !this.fileOrigin && !state.chapter?.inputs.length,
        recordingEpoch: epoch.recordingEpoch ?? undefined,
      });
      if (!current()) return;
      this.heads = [...this.heads.filter((p) => p.castId !== castId), envelope].sort((a, b) =>
        a.castId.localeCompare(b.castId),
      );
      this.key = crypto.randomUUID();
      this.lab.setPersonaRecording(this.key);
      this.status = `${villager.name}: accepted ${envelope.terminal ? 'terminal closure' : 'source checkpoint'}. Unsupported state remains in the local export.`;
      this.changed();
      await this.recording();
    });
    this.operation = task.catch(() => {});
    return task;
  }
  async checkpointAll() {
    for (const c of CAST) {
      try {
        await this.checkpoint(c.castId);
      } catch (error) {
        this.status = String(error);
      }
    }
    this.changed();
  }
}
