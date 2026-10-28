# HF 4 port audit, 2026-10-28

Remaining: G3's public sourced worship-calendar projection; the Commonstead run bridge and all delivery proofs. This is a blocker record. Actor dependencies and gameplay are unchanged.

## Published target

- `@adam0white/human-framework@4.5.1`, npm tarball SHA-1 `dd4baf7524bf41fd9782cb8db872aa83b2fffac7`.
- Runtime package `@adam0white/human-framework@4.5.1`, build `3cc286c9c3bd6b8ef75d227b726147d8ed4e3f829b7f26698a3cc308e9f547ae`, schema `20f919eccff8ed79c9c58f0a4614b5b70aae73a5f5b314810db6ce6df1f8de4e`.
- Matching immutable releases: [lab-client 0.5.2](https://github.com/adam0white/human-framework/releases/tag/lab-client-v0.5.2), [lab-kit 0.5.19](https://github.com/adam0white/human-framework/releases/tag/lab-kit-v0.5.19).
- Current game source: `aa63fdf`, HF actor package 3.0.0 / engine 2.23.0, lab-client 0.5.0, lab-kit 0.5.17. The client's separately scoped portable dependency does not upgrade the actor engine.

## G3 evidence and decision

`src/settlement.ts:initSettlement` currently calls `prayerWindows` for the day and next Fajr. `bodyChoices` offers prayer against HF's actual pending commitments. `stepSettlement` lets HF advance fulfillment and debt. The finite schedule is gameplay in the longer-day, reply and peer-conversation editions, not unused metadata.

The actual npm consumer used only the public run surface and the version-tagged minimal-host authoring example. It supplied Fajr 05:00, sunrise 06:30, Dhuhr 12:00, Asr 16:00, Maghrib 18:00, Isha 20:00 and next Fajr 05:00 on two days. The person held the published sourced salah norm. `createRun` and `createPerson` accepted the data. `inspect` found zero commitments both at 07:00 and after `step` to 12:01. A second arm with one explicit Dhuhr commitment retained that duty. Both archives passed exact `replay`. `prayerWindows` is absent from the package's public exports. Published internal prayer code is not a public import route.

This is the existing **G3 / Commonstead worship-calendar** need in human-framework `docs/hf4-game-needs.md`. A host may author a calendar's times and ordinary duties. This port must not copy the framework's religious schedule interpretation into the game to replace the removed sourced helper. Retain the released game and request no HF edits from this worker. Recheck on 2026-11-03. No owner design question blocks this engineering decision.

## G2 evidence and limits

The public v2 route can retain supported native people. All eight fresh short-day residents projected and admitted into an HF 4 authored opening. All eight fresh longer-day residents did too, with five finite commitments each. Admission used explicit action/entity/norm mappings, the original native norm catalogue, sourced provenance and JSON source checkpoints. Each resulting HF archive replayed exactly.

Played native source controls used public commands and actual paused boundaries. Short-roof at tick 66 projected six episodes. Yield at tick 130 projected fourteen episodes. Each source game's complete export/import matched. A longer-roof source at tick 226 refused legacy projection; no cause has been established. These controls do not prove complete calendar reconstruction or destination admission for played sources. Do not call that refusal an HF defect, remove retained state, or silently replace it with a fresh actor.

The game must replace its finite legacy DTO adapters with the supported retained route when the shared run bridge proceeds. Actual host action, carried-load, roof, reply, trolley and publication boundaries still apply. New-pin carryover in every native edition remains required. Core admission capability is not shelf CAS, a cross-game browser journey or a new-pin whole-game replay receipt.

## Scope retained

All existing imported HF 3 operations still need conversion: actor creation, decisions and suggestions, begin/finish/interruption, ticks, perception, conversation, social events, reviews, commitment creation/release, body reads and calendar/person projections. `enableFullness` and `enable.suggestionReasons` must disappear in the eventual all-faculty run bridge. Direct person reads in simulation, pressure, dialogue, rendering, continuity and passport code must move to explicit inspection. This audit changes none of those operations.

The current AGENTS.md has no “Public gameplay” section. No independent bounded public-gameplay defect was found during this bridge inventory. Existing design-document follow-ups retain their scope and dates. This record does not close them, owner gameplay acceptance or the HF 4 request.

## Reproduction artifacts

The task scratch directory `~/code/.lab-scratch/codex/commonstead-hf4-proof/` holds the exact npm tarball, its extracted unmodified public runtime, the tagged minimal host, `prayer-calendar-proof.ts` / `prayer-calendar-result.json`, `retained-native-proof.ts` / `retained-native-result.json`, and `native-boundaries-proof.ts` / `native-boundaries-result.json`. Diagnostic copies are separate from those public-consumer proofs. These synthetic controls contain no player data. The overall task report records review, CI and cleanup receipts separately.
