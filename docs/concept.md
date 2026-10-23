# Commonstead

A small settlement must raise a stone storehouse before an approaching storm. The player starts as an RTS commander and discovers that reliable production requires listening to people. Original name, text and Canvas drawings. No borrowed game assets or code.

## Authorization and completion

Owner Decision desk 2026-10-21 F-418 lifts direct control, real time and numeric HUD for this game. The owner permits eating, drinking and prayer in place. Framework and game remain separate. This increment ends with one playable map, a private repository, green required ci, a stamped static Worker deployment, two addressed concept reviews, deterministic replay/export controls and live Chromium checks at 360×690 and 1280×800. The owner accepts the game after playing; builder delivery is not owner acceptance.

## Opening minute

| Time at Steady | What the player sees and does |
|---|---|
| 0–10 seconds | Town centre, five distinct villagers, berry beds, trees and stone. Food 100, wood 80, stone 0; population 5/7. Goal: finish a storehouse before the storm at 10:00. Tap or click a person; selection rings and a named order panel appear. |
| 10–25 | Box-select several villagers; right-click trees, or long-press them on touch. A visible order marker and label confirm the destination. Villagers move and gather; stock increases. |
| 25–40 | Choose House (40 wood), then place it on open ground. Selected villagers walk there and construct it. Choose who stays on food. |
| 40–60 | Select the town centre and train a villager (35 food), subject to housing. Put workers on stone for the storehouse (180 wood, 120 stone). All healthy workers obey promptly. No compulsory tutorial dialog. |

Steady is one simulation second per wall second. Slow is half speed, Fast is four times. No hidden first-minute time compression. Bodies start rested; construction and gather work accumulate HF exertion. Movement stays immediate, and pathfinding is deliberately simple on an unobstructed map.

## Unravelling

| Horizon | Trigger and visible consequence | Player response |
|---|---|---|
| First 3 minutes | Sustained work raises HF exertion. A worker slows and says why. The selected panel shows observed words, not a fatigue percentage. First-minute exact resource stock remains exact because it is stored in the town centre, not a mind reading instrument. | Rest selected people in place, or rotate others onto the job. The previous work order resumes after a short recovery. |
| By 10 minutes | Repeated urgent orders while exhausted are remembered by HF. Temperament and HF response determine delay/refusal. Someone may say they need food or water and meet that need in place. At 8:00 a storm warning pins the deadline; at 10:00 the storm tests the completed storehouse. | Offer a break and food from stock; replace a worker; decide whether to sacrifice growth to finish shelter. Never click through a separate needs minigame. |
| By 30 minutes (later increment) | People have differing accounts of events and remembered treatment; reports of remote stocks become dated estimates while counted central stores stay exact. Prayer is a quiet voluntary pause at an understood time, never scored. | Ask for reports, inspect places and negotiate work. No divine acceptance meter or faith reward. |

The first two twists in this slice are embodied work pace and remembered treatment influencing willingness. Speech names an actual cause. A personal state is revealed only when observed or said; no true trust, temperament or need numbers on the HUD. A pinned objective and visible deadline survive every HUD stage. Storm resolution ends this bounded scenario with a tally and people's words; the player can export or send feedback.

## Framework boundary

Pin @adam0white/human-framework exactly 2.14.1. The host owns geometry, resource stocks, building progress, weather and RTS orders. Each villager owns an HF Person. HF owns body, temperament, memory and willingness. The host offers world affordances, advances HF deterministically, maps exertion into work rate and reads HF social responses; it does not reimplement a person model. Need acts occur at the person's position. All RNG is seeded and serialized. Input records use integer simulation ticks; replay does not depend on render rate, viewport, menu or speed. Export includes schema version, seed, input log and full state JSON. Import verifies replay equivalence before replacing a run.

## Controls and screens

Desktop: click person/building, drag to box-select; right-click a resource, construction or ground to order. Touch 360×690: tap selects; drag-box selects; stationary 500 ms long-press orders, with pointer capture and cancelled tap after a long-press. Selection also has named 44px person chips and explicit action buttons. Build uses a visible placement mode, then a tap on empty ground. Invalid placement explains the obstruction/cost without spending stock. Cancel exits placement. Orders receive a marker plus text. Touch-action none applies only to the map. No camera scrolling is needed: the whole small map fits.

Five screens: title shelf (continue/new/load run), play, paused menu, feedback, end. Menu and info pause simulation. Autosave after inputs and periodically. Export remains available with telemetry off. Feedback has optional name/tester id remembered on device, verdict chips and note; state plainly that a name labels linked history. Default-on telemetry notice, menu off switch and privacy link use vendored lab-client 0.2.1 and lab-kit 0.3.1. Respect privacy signals through the client's consented send path.

Grammar exception: an RTS needs a larger map than the 120–260px scene guidance, desktop map around 65%, numeric central resource strip and rate-free Slow/Steady/Fast controls. Phone map is flexible; the selected sheet scrolls internally; actions stay in thumb reach. No document scroll at 360×690. Use the lab's warm paper, ink and muted green palette, clear outlined controls and strong selection rings.

## Deferred

- 2026-10-30, owner review: evaluate the first minute against genre-player reports; owner decides acceptance or revision.
- 2026-11-06, proposal only: 30-minute settlement, witnessed reports and information loss. Not part of this vertical slice.
- 2026-11-06, proposal only: richer conflict, prayer-time cadence across a full day, explicit conversations, saves migrated across versions and accessibility beyond named unit controls.
- 2026-11-13, proposal only: obstacles and pathfinding, combat, additional maps. No server infrastructure planned.

## Review resolutions (2026-10-23)

- Genre rush / W2: storehouse costs 180 wood and 120 stone and needs 180 worker-seconds of construction. Its completion is the sole win condition at 10:00: it keeps the seed grain dry. Without it the grain spoils; no injury or hidden housing criterion. Houses add two population spaces. Opening stock stays 80 wood. Compare direct rush, growth and rotation in the headless control; record actual outcomes, not promised balance. If completion comes early, the settlement may continue gathering until the storm; preparation remains optional.
- Genre order semantics: normal repeated or changed destinations carry no treatment penalty. Only a separate, labelled Push on action insists on current work. Its visible warning says that it may get work done under protest and be remembered. The first minute uses host direct commands; later requests pass through HF willingness. This is an explicit narrative transition, not a permanent obedience assumption.
- Genre recovery / W3: each person retains their own suspended order. Rest takes 35 seconds then resumes it. People also take their own recovery when necessary. Show “working”, “needs relief”, “resting; then [task]”, “waiting / refused” and a visible work-site progress outline. No private values. Manual rotation changes allocation; it is not required for every recovery cycle. Descriptive closing words mention pressure or relief even if grain is lost.
- W1 / W4 / genre phone: explicit Food / Wood / Stone buttons issue selected people's orders without gestures. A Move button arms a destination tap. Clear selection and selected names are visible. Long-press has a growing ink ring. Named person chips disambiguate dense map targets. Put latest speech and selected work in the first view; keep stock and deadline outside the scrolling sheet.
- W6: Menu is labelled “Menu · pause” and the open menu says “Paused”. Title says the menu pauses for reading. No forced tutorial.
- W5: live phone verification must cover map targeting with selected sheet, multi-selection, placement and recovery. Record builder checks separately from cold player tests. No cold human test is claimed.

Scenario tuning: game time is real seconds; HF body time can use an explicit accelerated scale so exertion appears during a ten-minute slice. The exact scale is a host scenario assumption documented with implementation, not a physiological claim. No custom fatigue or trust model is introduced.

### Builder clarity check

DL-32/33: selecting, moving, gathering and placing buildings act on the map immediately. Orders remain available continuously until storm resolution; no action quota or forced wait. Named controls are a complete gesture alternative. This is a builder check, not a cold-player result. The first-minute scene starts immediately after one title action. Private HF values appear only in export, never the player HUD. Storehouse completion progress counts visible construction, while personal tiredness is drawn and said.
