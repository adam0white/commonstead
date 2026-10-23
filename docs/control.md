# Historical pre-cast simulation controls — 2026-10-23

These receipts describe the five-person edition at 7103af9. They are not current balance or canonical-edition verification. Current content-phase checks are recorded in cast-adoption.md; rerun the policies before making new balance claims.

Builder checks use the installed `@adam0white/human-framework` 2.14.1. These are deterministic headless checks, not cold player tests or evidence of owner acceptance.

## Boundary and scenario assumptions

Each villager contains an actual HF `Person`. HF `tick`, `decide`, `begin`, `finish`, `perceive`, and `readPerson` own and advance the body, will, remembered episodes and voice history. The host never writes fatigue, trust or personal need reservoirs. World stocks, movement, population capacity, building progress and commands belong to the host.

One game tick is one real second at Steady. Each tick advances HF by 0.5 minutes: body time is accelerated 30 times for this ten-minute scenario. This is a scenario assumption, not a physiological claim. People begin at HF 08:00 with rested bodies. Temperament differs between villagers. The seed initializes their serialized HF RNG; the initial map and temperament profiles remain fixed across seeds.

A work offer uses HF effort 0.9 and material value 8 for a ten-second labor period. Material value is an advertised labor benefit, not resource stock. The world produces 0.52 resource units per worker-second multiplied by HF body capacity and, for an actual HF protest, 0.75. Houses need 35 worker-seconds. Storehouses need 180 worker-seconds. Movement uses a separate HF affordance with effort 0.15 and moves 65 map units per second. Work sites give people deterministic 18-pixel offsets.

Before tick 60 the offered task receives direct host control through a single HF task affordance. Tired speech appears from tick 60. Later decisions offer work, rest, water and (when stock permits) food. HF chooses relief; the host schedules the chosen in-place act. Rest lasts 35 real seconds and retains each person's own suspended order. Meals and drinks also happen in place. Normal requests after minute one use the commander voice at strength zero, so they add no pressure. An identical ordinary order leaves the person untouched. Explicit Push on uses strength one and `insist: true`, routes treatment through HF, and is heard as an HF percept. HF distrust words are shown verbatim when distrust determines refusal.

Training reserves 35 food and one population space when issued. One trainee can be queued. They arrive after 15 ticks. Meals reserve two food when begun; training cannot spend reserved food. A new Move cancels an in-place break and starts the movement affordance immediately. No personal fatigue percentage, trust score or temperament value is exposed to the player.

Exports contain schema, exact framework version, seed, ordered tick inputs and full state JSON. Import recomputes the run and compares canonical full state plus a hash before replacement. The hash is an accidental-change checksum, not authentication; replay equivalence is the validation. Imports are capped at 600 ticks and 10,000 inputs.

## Strategy comparison

Default seed 418, one-second steps to tick 600. All three controls finish before the storm. This demonstrates solvability and a measurable growth tradeoff; it does not establish expert balance or the value of every rotation policy.

| Policy | Storehouse placed | Completed | Population | Final food | Final wood | Final stone | Final hash |
|---|---:|---:|---:|---:|---:|---:|---|
| Direct rush | 190 | 278 | 5 | 100 | 75.83 | 0.28 | fa1ad7ab |
| Growth | 190 | 262 | 7 | 61.41 | 44.33 | 0.28 | 537bbd1a |
| Rotation | 190 | 285 | 5 | 100 | 73.46 | 0.28 | f2bdc1e1 |

All policies initially order v1–v3 to wood and v4–v5 to stone. When wood reaches 180 and stone reaches 120, place the storehouse at (760,470) and assign everyone. Record placement only after the building exists. Continue until tick 600.

Growth additionally builds a house at (610,470) with v1 and v2 at tick 0, sends v3 to food, trains at ticks 50 and 65, then assigns v1, v2, v3, v6 and v7 to wood at tick 80. Rotation instead rests one worker every 90 ticks until storehouse placement, taking the worker at array index `floor(tick/90) % 5`; their own task resumes after 35 seconds. The direct rush adds neither action.

## Body and treatment checks

Seed 7, v1 on wood continuously: production in ticks 41–60 is 8.2975 wood. Production in ticks 161–180 is 3.6938 wood, including HF-selected relief. Exertion at tick 180 is 0.5300. The worker says, “I am tired. My work is slower; I need relief.” Work rate uses HF capacity; total production also reflects the person's own recovery choice.

A separate seed-42 pressure regression works v1 for 160 ticks, issues Push on twenty times, then advances ten ticks. HF's resolution becomes `refused`, with reason `distrust`, and says, “You've pushed me enough.” The game shows those actual HF words. Repeating the same ordinary work order does not mutate the person's will.

## Verification and review fixes

`npm test`: 13 focused tests pass. `npm run typecheck`: passes. Biome checks of simulation and tests pass without warnings. Tests cover initial actual HF people, deterministic replay, full-state export roundtrip, tamper rejection, HF exertion and slower production, ordinary-order idempotence, explicit remembered pressure, per-person rest/resumption, blocked building costs, housing, meal nourishment and reservation, immediate low-effort movement, queued training and storm termination.

Implementation review fixes reserve meal stock before training, separate movement from gathering effort, avoid worker coordinate overlap, queue training rather than spawning instantly, and show actual HF distrust speech. No framework source, existing project or lab index was edited.
