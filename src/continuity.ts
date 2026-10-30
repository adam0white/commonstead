import type {
  Lab,
  LifePreparation,
  PersonaEnvelope,
  PersonaLife,
  PersonaRequest,
} from '@adam0white/lab-client';
import {
  anchorPersonaLife,
  canonicalCast,
  claimCastChapterBatch,
  closePersonaBranch,
  createPersona,
  initialPersonaLife,
  type personaChannel,
  preparePersonaLife,
  validatePersona,
} from '@adam0white/lab-client';
import { type AdmissionPin, AdmissionStore, admissionPin } from './admission-store';
import { CAST } from './cast.ts';
import { prepareDeparture } from './departure-source';
import { FRAMEWORK_VERSION } from './engine';
import { isContinuingCommitment, snapshot } from './hf4';
import {
  admitResident,
  type Chapter,
  claimTransfer,
  DIALECT,
  RULES,
  requirePeerReadiness,
  residentTransfer,
} from './passport.ts';
import { PRESSURE } from './pressure.ts';
import { NativeSaveStore } from './save-store';
import { activeLongRoof, type SettlementConfig } from './settlement.ts';
import { activePeer } from './settlement-dialogue.ts';
import { requireSharedWriteCapability } from './shared-write-capability';
import {
  activeRoofBreak,
  apply,
  createGame,
  exportRun,
  holdPublication,
  importRunAsync,
  type State,
} from './sim.ts';
import { requireSupportedProducer } from './story-records.ts';

type Shelf = ReturnType<typeof personaChannel>;

import {
  retainSource,
  type SourceArchive,
  validateSourceArchives,
  validateSourceReferences,
} from './source-archives';
export const LOCAL_KEY = 'commonstead-cast-local-v3';
const maxArchive = 1_000_000;

/** Run-scoped ownership, recording and source archive. No current shelf reads on local load. */
export class Continuity {
  generation = 0;
  private loading = new AbortController();
  loadProgress?: (tick: number) => void;
  heads: PersonaEnvelope[] = [];
  fileOrigin = false;
  playPaused = false;
  busy = false;
  publishing = false;
  private deferredInvalidation = false;
  status = 'New chapters check saved people automatically. Recording is a separate choice.';
  runId = crypto.randomUUID();
  sources: SourceArchive[] = [];
  private key = crypto.randomUUID();
  private operation = Promise.resolve();
  private state: State | null = null;
  admissionBlocked: { castId: string; reason: string }[] = [];
  private deniedIDs: string[] | undefined;
  private requirePublicationAuthority(castId: string) {
    if (!this.deniedIDs)
      throw new Error(
        'This save has no resident publication authority. Keep playing locally or download the complete game.',
      );
    if (this.deniedIDs.includes(castId))
      throw new Error(
        `${canonicalCast(castId).name}: this saved history is still in another game and cannot be saved here.`,
      );
  }
  readonly admissions = new AdmissionStore();
  constructor(
    readonly lab: Lab,
    readonly shelf: Shelf,
    readonly changed: () => void = () => {},
    readonly store = new NativeSaveStore(),
  ) {
    lab.setPersonaRecording(`startup-${this.key}`);
  }
  source(): PersonaEnvelope['source'] {
    return {
      game: 'commonstead',
      build: String(this.lab.build().c ?? 'local'),
      engine: FRAMEWORK_VERSION,
      rules: RULES,
    };
  }
  invalidate() {
    if (this.publishing) {
      this.deferredInvalidation = true;
      return;
    }
    this.loading.abort();
    this.loading = new AbortController();
    this.generation++;
    this.key = crypto.randomUUID();
    this.lab.setPersonaRecording(this.key);
    this.changed();
  }
  /** Start before any file read or entry confirmation, including rejected selections. */
  beginEntry() {
    this.requireNoPublication();
    this.invalidate();
    return this.generation;
  }
  currentEntry(generation: number) {
    return generation === this.generation;
  }
  private requireNoPublication() {
    if (this.publishing) throw new Error('Wait for the resident save to finish before changing games.');
  }
  private requireEntry(generation: number) {
    this.requireNoPublication();
    if (!this.currentEntry(generation))
      throw new Error('The game changed while the entry was loading. Try loading it again.');
  }
  clear() {
    this.requireNoPublication();
    this.invalidate();
    this.state = null;
    this.heads = [];
    this.sources = [];
    this.deniedIDs = undefined;
  }
  async fresh(
    seed: number,
    config?: SettlementConfig,
    rules: typeof PRESSURE | null = PRESSURE,
    generation = this.beginEntry(),
  ) {
    this.requireEntry(generation);
    if (rules !== PRESSURE)
      throw new Error('Keep the original file and start a fresh game with the current rules.');
    if (this.busy)
      throw new Error('A chapter is already being prepared. Wait for it to finish before starting another.');
    this.busy = true;
    try {
      await this.shelf.ready;
      // Fresh native chapters always check the central shelf; recording stays separate.
      if (!this.shelf.enabled) {
        this.shelf.setEnabled(true);
        await this.shelf.ready;
      }
      this.requireEntry(generation);
      if (generation !== this.generation)
        throw new Error('The game changed before the residents could join. Try starting the chapter again.');
      await this.store.read();
      const previousRevision = this.store.observedRevision;
      const sourceIdentity = JSON.stringify(this.source());
      const current = () =>
        generation === this.generation && JSON.stringify(this.source()) === sourceIdentity;
      const nextRunId = crypto.randomUUID();
      let candidate: State | undefined;
      let preparedId: string | undefined;
      let preparedPin: AdmissionPin | undefined;
      let emptyAcknowledged = false;
      let deniedIDs: string[] | undefined;
      const wrapper = (state: State, claims: PersonaEnvelope[]) =>
        JSON.stringify({
          run: exportRun(state),
          runId: nextRunId,
          fileOrigin: false,
          heads: claims,
          sources: [],
          ...(deniedIDs === undefined ? {} : { deniedIDs }),
          ...(state.chapter?.blocked?.length ? { admissionBlocked: state.chapter.blocked } : {}),
        });
      const base = createGame(seed, undefined, config, config || !rules ? undefined : rules);
      let chapter: Chapter | undefined;
      let shelfUnavailable = false;
      if (this.shelf.enabled) {
        let prepared = false;
        let rawPrepare:
          | {
              inputs: LifePreparation[];
              blocked: { castId: string; reason: string }[];
              expectedHeads: Record<string, string | null>;
            }
          | undefined;
        let accepted: LifePreparation[] = [];
        let initial: Chapter['initial'] | undefined;
        const bridge = {
          request: async <T>(request: PersonaRequest): Promise<T> => {
            if (request.action === 'putBatch') {
              this.requireEntry(generation);
              for (const envelope of request.envelopes ?? []) requireSharedWriteCapability(envelope.castId);
              if (
                !rawPrepare ||
                JSON.stringify(request.expectedHeads) !== JSON.stringify(rawPrepare.expectedHeads)
              )
                throw new Error('Prepared shelf parents changed. No claim was sent.');
              if (!initial) {
                if (
                  rawPrepare.inputs.length ||
                  rawPrepare.blocked.length ||
                  CAST.some((c) => rawPrepare!.expectedHeads[c.castId] !== null) ||
                  request.envelopes?.length
                )
                  throw new Error('The empty shelf outcome does not match its preparation.');
                if (!current()) throw new Error('The preparation source changed before the empty claim.');
                const result = await this.shelf.request<T>(request);
                this.requireEntry(generation);
                emptyAcknowledged = true;
                return result;
              }
              const claims = request.envelopes ?? [];
              const nonaccepted = CAST.filter((c) => !accepted.some((i) => i.parent.castId === c.castId)).map(
                (c) => c.castId,
              );
              deniedIDs = nonaccepted.filter((id) => rawPrepare!.expectedHeads[id] !== null);
              const pinned: Chapter = {
                version: DIALECT,
                initial,
                inputs: accepted,
                claims,
                blocked: nonaccepted
                  .filter((id) => rawPrepare!.expectedHeads[id] !== null)
                  .map((castId) => ({
                    castId,
                    reason: 'No accepted retained history was recorded for this preparation.',
                  })),
              };
              candidate = createGame(seed, pinned, config, config || !rules ? undefined : rules);
              preparedId = crypto.randomUUID();
              const pin = await this.admissions.stage(
                {
                  id: preparedId,
                  source: sourceIdentity,
                  generation,
                  previousRevision,
                  expectedHeads: structuredClone(rawPrepare.expectedHeads),
                  claims,
                  accepted: accepted.map((i) => i.parent.castId),
                  nonaccepted,
                  // Denial metadata is enough. Never persist unowned source histories.
                  rawPrepare: { expectedHeads: rawPrepare.expectedHeads, blocked: pinned.blocked },
                  candidate: wrapper(candidate, claims),
                },
                current,
              );
              preparedPin = pin;
              // Forwarding is durable before the public write; a lost return remains unknown.
              await this.admissions.markForwarded(preparedId, current, pin);
              this.requireEntry(generation);
              if (!current()) throw new Error('The preparation source changed before the claim.');
              return this.shelf.request<T>(request);
            }
            const reply = await this.shelf.request<T>(request);
            if (request.action === 'prepareBatch') {
              prepared = true;
              rawPrepare = structuredClone(reply) as typeof rawPrepare;
              validatePreparation(rawPrepare);
              deniedIDs = [];
            }
            return reply;
          },
        };
        let result: Awaited<ReturnType<typeof claimCastChapterBatch<Chapter['initial']>>>;
        try {
          result = await claimCastChapterBatch(
            bridge,
            CAST.map((c) => c.castId),
            this.source(),
            async (inputs: LifePreparation[]) => {
              accepted = structuredClone(inputs);
              initial = Object.fromEntries(base.villagers.map((v) => [v.person.id, v.person]));
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
            {
              isCurrent: current,
              claimTransfer,
              admitPerson: (input) => {
                requirePeerReadiness(input.parent.castId);
                const probe = createGame(seed, undefined, config, config || !rules ? undefined : rules);
                const opening = probe.villagers.find((v) => v.person.id === input.parent.castId)?.person;
                if (!opening) throw new Error('This person has no resident role.');
                admitResident(input, opening);
              },
            },
          );
        } catch (error) {
          // Only a failed read permits local play. An unacknowledged write may own shelf people.
          const message = error instanceof Error ? error.message : String(error);
          if (
            prepared ||
            ![
              'Continuity is local to this game. Use a file.',
              'Shelf unavailable. Use a local file.',
            ].includes(message)
          )
            throw error;
          shelfUnavailable = true;
          result = null;
        }
        if (result)
          chapter = {
            version: DIALECT,
            initial: result.initial,
            inputs: result.inputs,
            claims: result.claims,
            blocked: result.blocked,
          };
      }
      if (generation !== this.generation)
        throw new Error(
          'The game changed while the chapter was being prepared. No new chapter started. Try starting it again.',
        );
      this.requireEntry(generation);
      // The default short chapter plays under the pressure rules; longer days keep their editions.
      const state = candidate ?? createGame(seed, chapter, config, config || !rules ? undefined : rules);
      if (preparedId) {
        if (!(await this.admissions.promote(preparedId, current, preparedPin!)))
          throw new Error('Prepared chapter could not replace the previous save. Keep both sources.');
        await this.store.read();
      } else {
        if (!shelfUnavailable && !emptyAcknowledged)
          throw new Error('The shelf preparation was not acknowledged.');
        if (!(await this.store.write(wrapper(state, []), current)))
          throw new Error('The new chapter could not be saved. Your previous game is unchanged.');
      }
      this.requireEntry(generation);
      this.deniedIDs = deniedIDs;
      this.admissionBlocked = structuredClone(state.chapter?.blocked ?? []);
      this.state = state;
      this.runId = nextRunId;
      this.sources = [];
      this.heads = chapter?.claims ?? [];
      this.fileOrigin = false;
      const blockedNames = chapter?.blocked?.map((entry) => canonicalCast(entry.castId).name) ?? [];
      this.status = shelfUnavailable
        ? 'This chapter is saved on this device. Shared resident histories are unavailable here.'
        : blockedNames.length
          ? `${blockedNames.join(', ')}: saved history is still in another game. This chapter starts with a local resident; that history cannot be saved here. Other supported histories carry over.`
          : chapter
            ? `This chapter carries over ${chapter.inputs.length} supported histories. All residents were checked together. The other residents begin with their original histories.`
            : 'You started a fresh chapter with the residents’ original histories. There were no saved histories to carry over.';
      // Caller installs the prepared state before opening any recording hook.
      return state;
    } finally {
      this.busy = false;
    }
  }
  /** Explicit recovery never resends the old put. Current public heads, not history, own custody. */
  async discardUnused(generation = this.beginEntry()): Promise<boolean> {
    this.requireEntry(generation);
    const intent = await this.admissions.read();
    if (!intent) return false;
    const source = JSON.stringify(this.source());
    const current = () => this.currentEntry(generation) && JSON.stringify(this.source()) === source;
    if (intent.source !== source)
      throw new Error('This preparation could not be cleared safely. Your saved game was kept.');
    const heads = Object.fromEntries(
      await Promise.all(
        Object.keys(intent.expectedHeads).map(async (castId) => [
          castId,
          await this.shelf.request<PersonaEnvelope | null>({ action: 'get', castId }),
        ]),
      ),
    );
    if (!(await this.admissions.discardUnused(admissionPin(intent), heads, current)))
      throw new Error('The preparation or current ownership changed. Both saves remain held.');
    this.status = 'The unused preparation was cleared. Your saved game was kept.';
    return true;
  }
  async recoverPrepared(generation = this.beginEntry()): Promise<State | null> {
    this.requireEntry(generation);
    const intent = await this.admissions.read();
    if (!intent) return null;
    const source = JSON.stringify(this.source());
    if (intent.source !== source)
      throw new Error(
        'The prepared chapter belongs to a different source build. Keep both original downloads and start a fresh game.',
      );
    const current = () => this.currentEntry(generation) && JSON.stringify(this.source()) === source;
    const readHeads = async () =>
      Object.fromEntries(
        await Promise.all(
          Object.keys(intent.expectedHeads).map(async (castId) => [
            castId,
            await this.shelf.request<PersonaEnvelope | null>({ action: 'get', castId }),
          ]),
        ),
      );
    const heads = await readHeads();
    this.requireEntry(generation);
    if ((await this.admissions.recover(heads)) !== 'accepted')
      throw new Error(
        'Current resident custody is unresolved. Your previous game and prepared chapter are unchanged.',
      );
    const text = await this.admissions.preparedText();
    if (!text) throw new Error('Prepared chapter is unavailable.');
    const saved = JSON.parse(text);
    const deniedIDs = validateDeniedIDs(saved.deniedIDs);
    const candidate = await importRunAsync(saved.run, {
      signal: this.loading.signal,
      progress: this.loadProgress,
    });
    await this.validateRunEnvelopes(candidate);
    if (
      saved.fileOrigin !== false ||
      JSON.stringify(saved.sources) !== '[]' ||
      JSON.stringify(saved.heads) !== JSON.stringify(intent.claims) ||
      JSON.stringify(candidate.chapter?.claims) !== JSON.stringify(intent.claims) ||
      JSON.stringify(candidate.chapter?.inputs.map((i) => i.parent.castId)) !==
        JSON.stringify(intent.accepted) ||
      candidate.chapter?.inputs.some((i) => intent.expectedHeads[i.parent.castId] !== i.parent.revision)
    )
      throw new Error(
        'Prepared chapter metadata does not match its pinned claims and accepted residents. Keep both sources.',
      );

    validateDenialAgreement(deniedIDs, candidate, saved.heads);
    // Recheck after expensive replay. Public shelf calls cannot promise a distributed transaction.
    const latest = await readHeads();
    if (!current() || (await this.admissions.recover(latest)) !== 'accepted')
      throw new Error('Resident custody changed during recovery. Keep both downloads.');
    if (!(await this.admissions.promote(intent.id, current, admissionPin(intent))))
      throw new Error('The previous complete save changed. Prepared chapter was not installed.');
    await this.store.read();
    this.requireEntry(generation);
    this.deniedIDs = deniedIDs;
    this.admissionBlocked = structuredClone(candidate.chapter?.blocked ?? []);
    this.state = candidate;
    this.runId = saved.runId;
    this.heads = saved.heads;
    this.sources = saved.sources;
    this.fileOrigin = false;
    this.status = 'Recovered the prepared chapter from exact current resident claims. No claim was resent.';
    return candidate;
  }
  async validateRunEnvelopes(state: State) {
    await validateRunEnvelopes(state);
  }

  async loadLocal(text: string, generation = this.beginEntry()) {
    this.requireEntry(generation);
    const saved = JSON.parse(text);
    const deniedIDs = validateDeniedIDs(saved.deniedIDs);
    const state = await importRunAsync(saved.run, {
      signal: this.loading.signal,
      progress: this.loadProgress,
    });
    validateYieldSources(saved.sources);
    await validateSourceArchives(saved.sources);
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
    this.requireEntry(generation);
    const blocked = saved.admissionBlocked ?? state.chapter?.blocked ?? [];
    if (
      !Array.isArray(blocked) ||
      blocked.length > 8 ||
      new Set(blocked.map((entry: { castId: string }) => entry?.castId)).size !== blocked.length ||
      JSON.stringify(blocked.map((entry: { castId: string }) => entry?.castId).sort()) !==
        JSON.stringify((state.chapter?.blocked ?? []).map((entry) => entry.castId).sort()) ||
      blocked.some(
        (entry: { castId: string; reason: string }) =>
          !entry ||
          !CAST.some((c) => c.castId === entry.castId) ||
          typeof entry.reason !== 'string' ||
          entry.reason.length > 500 ||
          heads.some((p) => p.castId === entry.castId),
      )
    )
      throw new Error('Invalid prepared history status.');
    validateDenialAgreement(deniedIDs, state, heads);
    this.deniedIDs = deniedIDs;
    this.admissionBlocked = structuredClone(blocked);
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
    const deniedIDs = validateDeniedIDs(raw.castDeniedIDs);
    const { castSources: archiveSources, castDeniedIDs: _deniedIDs, ...native } = raw;
    const state = await importRunAsync(native, { signal: this.loading.signal, progress: this.loadProgress });
    validateYieldSources(archiveSources ?? []);
    await validateSourceArchives(archiveSources ?? []);
    await this.validateRunEnvelopes(state);
    const sources = raw.castSources ?? [];
    if (!Array.isArray(sources) || JSON.stringify(sources).length > maxArchive)
      throw new Error(
        'The file contains too much saved source data. Load a smaller file or start a fresh chapter.',
      );
    if (generation !== this.generation)
      throw new Error('The game changed while the file was loading. Try loading it again.');
    this.requireEntry(generation);
    validateDenialAgreement(deniedIDs, state, []);
    this.deniedIDs = deniedIDs;
    this.admissionBlocked = structuredClone(state.chapter?.blocked ?? []);
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
      ...(this.deniedIDs === undefined ? {} : { deniedIDs: this.deniedIDs }),
      ...(this.admissionBlocked.length ? { admissionBlocked: this.admissionBlocked } : {}),
    });
  }
  export(state: State, compact = false) {
    return {
      ...(exportRun(state, compact) as object),
      castSources: structuredClone(this.sources),
      ...(this.deniedIDs === undefined ? {} : { castDeniedIDs: structuredClone(this.deniedIDs) }),
    };
  }
  departure(state: State, castId: string) {
    if (this.fileOrigin || this.state !== state)
      throw new Error(
        'File sessions do not acquire or prepare shared resident ownership. Download the original file.',
      );
    this.requirePublicationAuthority(state.villagers.find((v) => v.id === castId)?.person.id ?? castId);
    return prepareDeparture(state, castId, {
      runId: this.runId,
      source: this.source(),
      heads: this.heads,
      sources: this.sources,
    });
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

  checkpoint(castId: string, fork = false) {
    const generation = this.generation,
      state = this.state,
      runId = this.runId,
      tick = state?.tick,
      inputCount = state?.inputs.length;
    const task = this.operation.then(async () => {
      if (this.fileOrigin) throw new Error('File play cannot publish people.');
      if (this.busy) throw new Error('The game changed while another chapter was being prepared.');
      const current = () =>
        generation === this.generation &&
        state === this.state &&
        runId === this.runId &&
        state?.tick === tick &&
        state?.inputs.length === inputCount;
      this.requirePublicationAuthority(castId);
      // One producer entry covers living projection and terminal close before either branch.
      if (state && current()) requireSharedWriteCapability(castId);
      if (
        !state ||
        !current() ||
        state.tick === 0 ||
        (!state.chapterPaused &&
          !state.ended &&
          state.villagers.find((v) => v.person.id === castId)?.person.body.alive !== false)
      )
        throw new Error(
          'Play the chapter first. Then pause it and wait for current actions to finish before saving a person.',
        );
      requireSupportedProducer(state);
      await this.shelf.ready;
      if (!current() || !this.shelf.enabled)
        throw new Error(
          'Saving people between games is off, or the game has changed. Check the setting and try saving the person again.',
        );
      const villager = state.villagers.find((v) => v.person.id === castId);
      if (!villager || !CAST.some((c) => c.castId === castId))
        throw new Error('This person is not a Commonstead resident. Choose someone from the resident list.');
      if (state.chapter?.blocked?.some((entry) => entry.castId === castId))
        throw new Error(
          `${villager.name}: this saved history is still in another game and cannot be saved here.`,
        );
      requirePeerReadiness(castId);
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
        const closed = await closePersonaBranch(
          parent,
          this.source(),
          Math.round(villager.person.now * 60_000),
        );
        const { revision: _revision, ...body } = closed;
        envelope = await createPersona({ ...body, transfer: { ...body.transfer, hostRun: runId } });
      } else {
        requireDepartureBoundary(state, villager.id);
        if (villager.order && state.buildings.some((b) => b.id === villager.order?.target && !b.complete))
          throw new Error(
            'This resident still has shared building work to finish. Finish it before the resident leaves.',
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
        // A published calendar must pass the same semantic admission as the next native chapter.
        // This retains unsupported prayer/debt/source guards rather than silently discarding duties.
        const opening = createGame(state.seed).villagers.find((v) => v.person.id === castId)!.person;
        admitResident(preparePersonaLife(envelope, Date.now()), opening);
      }
      if (!current())
        throw new Error('The game changed before the person could be saved. Try saving the person again.');
      // Preserve full actual source before publication, including failed CAS attempts, local only.
      if (raw) {
        const retained = await retainSource(this.sources, {
          revision: envelope.revision,
          source: envelope.source,
          snapshot: raw,
        });
        if (!current())
          throw new Error('The game changed before the person could be saved. Try saving the person again.');
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
      const release = holdPublication(state);
      this.publishing = true;
      try {
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
      } finally {
        release();
        this.publishing = false;
        if (this.deferredInvalidation) {
          this.deferredInvalidation = false;
          this.invalidate();
        }
      }
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

export function validateYieldSources(raw: unknown): asserts raw is SourceArchive[] {
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
  validateSourceReferences(raw);
}

/** Pure validation shared by native and memory-only entries. */
export async function validateRunEnvelopes(state: State) {
  if (state.chapter)
    await Promise.all(
      [...state.chapter.claims, ...state.chapter.inputs.map((i) => i.parent)].map((p) => validatePersona(p)),
    );
}

/** Native simulation obligations are local to their actual owner. Historical records are not work. */
function requireDepartureBoundary(state: State, id: string) {
  const v = state.villagers.find((v) => v.id === id)!;
  const w = state.settlement;
  const actor = w?.actors[id];
  const commitment = actor?.commitment;
  if (
    v.person.activity ||
    activeRoofBreak(state, id) ||
    activeLongRoof(state, id) ||
    activePeer(state, id) ||
    w?.replyScenes?.[id]?.attempts.some((a) => ['requested', 'running'].includes(a.status)) ||
    w?.dispute?.includes(id) ||
    w?.trolley === id ||
    (actor && (actor.running || actor.job || actor.path.length || actor.carried || actor.pendingRequest)) ||
    (commitment &&
      (v.person.agenda.commitments.some(
        (c) => c.id === commitment && isContinuingCommitment(v.person.agenda, c),
      ) ||
        v.person.agenda.owed?.some((d) => d.ofId === commitment || d.scheduledAs === commitment)))
  )
    throw new Error(
      'This resident still has unfinished work, supplies or conversations in this day. Finish or explicitly stop them before leaving.',
    );
}

/** Missing authority permits local play, never publication. Present malformed metadata refuses entry. */
export function validateDeniedIDs(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > CAST.length ||
    new Set(value).size !== value.length ||
    value.some((id) => typeof id !== 'string' || !CAST.some((c) => c.castId === id))
  )
    throw new Error('Invalid resident history denial metadata. Keep the original save.');
  return [...value];
}
export function validateDenialAgreement(ids: string[] | undefined, state: State, heads: PersonaEnvelope[]) {
  if (ids === undefined) return;
  const blocked = state.chapter?.blocked?.map((p) => p.castId) ?? [];
  if (
    ids.some((id) => heads.some((p) => p.castId === id) || !blocked.includes(id)) ||
    blocked.some((id) => !ids.includes(id))
  )
    throw new Error('Resident history denial metadata does not match the pinned chapter.');
}
function validatePreparation(value: unknown): void {
  const p = value as
    | {
        inputs?: LifePreparation[];
        blocked?: { castId: string; reason: string }[];
        expectedHeads?: Record<string, string | null>;
      }
    | undefined;
  const ids: string[] = CAST.map((c) => c.castId);
  if (
    !p ||
    !p.expectedHeads ||
    Object.keys(p.expectedHeads).length !== ids.length ||
    ids.some(
      (id) =>
        !Object.hasOwn(p.expectedHeads!, id) ||
        (p.expectedHeads![id] !== null && !/^[a-f0-9]{64}$/.test(p.expectedHeads![id]!)),
    ) ||
    !Array.isArray(p.inputs) ||
    !Array.isArray(p.blocked)
  )
    throw new Error('Invalid prepared resident history metadata. No chapter was started.');
  const present = [...p.inputs.map((i) => i?.parent?.castId), ...p.blocked.map((b) => b?.castId)];
  if (
    new Set(present).size !== present.length ||
    present.some((id) => !ids.includes(id)) ||
    ids.some((id) => (p.expectedHeads![id] !== null) !== present.includes(id)) ||
    p.inputs.some((i) => !i?.parent || i.parent.revision !== p.expectedHeads![i.parent.castId]) ||
    p.blocked.some((b) => !b || typeof b.reason !== 'string' || b.reason.length > 500)
  )
    throw new Error('Invalid prepared resident history metadata. No chapter was started.');
}
