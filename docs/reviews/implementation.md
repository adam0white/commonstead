# Independent implementation review

Reviewed `src/main.ts`, `src/draw.ts`, `src/sim.ts`, and supporting CSS/client transport. Review only. Source was changing during review; locations below name functions as well as approximate lines. Five strongest findings follow. No external model was used.

## P1 — Rendering replaces active controls on every simulation tick

`main.ts:update()` replaces `units.innerHTML` and `actions.innerHTML` on every call; `frame()` calls it after simulation steps. At Fast, this happens roughly every 250 ms. A button can disappear between pointer-down and pointer-up, losing its click. A focused named-person button also loses keyboard focus at the next tick. Those named controls are the phone and accessibility fallback, so their stability matters.

**Fix:** Preserve button elements and update their text, disabled state, and selection state in place. Rebuild only when the control structure changes. Verify a held pointer click spanning a simulation update and keyboard selection across several ticks at all three speeds.

## P1 — A meal can consume food already spent on training

`sim.ts:apply()` checks that food exists when a meal starts, but `step()` deducts the two-food cost only when the meal finishes. Meanwhile, training can spend that same stock. Completion uses `Math.max(0, food - 2)` and still awards full HF nourishment, silently creating meals without payment. Autonomous eat choices have the same delayed-accounting risk when several people decide before the first meal completes.

**Evidence:** A read-only Node reproduction started with 35 food, ordered all five people to eat, trained a sixth villager immediately, and advanced eight ticks. Training spent all 35 food; all five meals completed with stock remaining zero. The expected combined cost is 45.

**Fix:** Reserve food when an eating activity starts. Define how interruption releases or consumes the reservation. Test simultaneous meals, training during meals, and interrupted meals. Never award nourishment for unreserved food.

## P1 — Destination picking accepts villagers that cannot be ordered as destinations

`main.ts:destination()` calls `targetAt()`, whose nearest-hit candidates include villagers. It then sends the villager id as the order target. `sim.ts:apply()` accepts only resource/building ids or `move`, so right-clicking or long-pressing a person produces “That destination does not exist.” This also interferes with resource orders when people stand on the resource artwork: tapping a visible worker is an invalid destination instead of a resource order or a ground move.

**Fix:** Use separate hit tests for selection and commands. Command targeting should accept resources/buildings and otherwise use ground coordinates. Verify resource orders while workers occupy the node, particularly on the compressed phone map.

## P2 — Moving is treated as heavy production work and can wait through recovery

`sim.ts:assign()` calls `chooseWork()` for a `move` target. `chooseWork()` offers the same effort-0.9 work activity as gathering, including competing rest/eat/drink activities after tick 60. `step()` does not move a person until the chosen activity is work, and `assign()` leaves a new move order suspended during recovery. Walking therefore accumulates production exertion and may wait 35 seconds. This conflicts with the concept's explicit immediate-movement rule and makes basic repositioning subject to an unrelated production decision.

**Fix:** Give movement its own HF activity/load and command policy. Preserve HF body ownership, but keep the promised movement response separate from willingness to perform production. Verify a tired person can receive a move command and visibly start moving under the agreed rule.

## P2 — Training has no duration despite the UI promising one

`main.ts:update()` tells the player “Training takes time.” `sim.ts:apply({kind:'train'})` deducts food and inserts a fully available villager in the same input tick. There is no pending training job, progress, or arrival delay. The player can instantly buy two workers before any clock advancement, changing opening economy and housing decisions.

**Fix:** Implement a deterministic training queue/duration and expose its progress, or explicitly revise the rule and remove the claim. If keeping duration, cover queued housing capacity and replay equivalence with a pending trainee.

## Checks without a finding

HF Person creation, decisions, begin/finish, body advancement, and protest handling use the pinned framework rather than a replacement person model. Export/import replay checks full canonical state, not just the hash. The latest feedback code uses the client's explicit `sendRun` path under a privacy signal and the client blocks transport when recording is disabled. These code checks do not replace live UI or delivery evidence.

## Builder resolution

- Controls now retain DOM nodes until selection, affordability or control structure changes. The animation loop updates text after simulation steps; it does not recreate buttons every frame or tick. Keyboard focus and long pointer presses are checked in browser verification.
- Meals reserve stock on acceptance. Simulation tests cover training competing with meals and interruption. No nourishment is awarded on an interrupted meal.
- Selection hit testing and destination hit testing are separate. Destinations accept resource nodes and unfinished buildings, otherwise ground movement.
- Movement has a low-effort HF activity and interrupts a recovery immediately under this game's direct-control exception. Work sites use deterministic per-person offsets.
- Training reserves food and queues one arrival after 15 simulation seconds. The town panel reports a pending arrival and disables another train request.

These resolutions are builder claims checked by the focused tests and browser report; the review itself remains independent and unchanged above.
