# RTS genre review

Reviewed `docs/concept.md` as an RTS player. Review only; no concept or code changes. These are design risks inferred from the concept, not observed playtest failures.

## High — The fastest win may bypass both human twists

The player starts with 80 wood. The only required building costs 70 wood and 35 stone. Housing and training are optional expenditure; growth has no stated payoff after the storehouse finishes. An experienced RTS player will test putting the starting workers on stone, finishing the storehouse, and waiting. Exertion is expected in the first three minutes, while remembered treatment depends on repeated orders under exhaustion. Neither is required by the objective. Rates could prevent an immediate rush, but the concept does not establish that they do.

**Recommendation:** Balance and test the direct storehouse rush before building the onboarding around a house and a sixth worker. Require at least one meaningful work/rest allocation decision on the shortest viable completion path. Explain what the player does between early completion and the storm; consider immediate resolution if nothing can affect the outcome.

**Acceptance evidence:** Record completion times and human-state events for a direct rush, the suggested growth opening, and an opening that rotates workers. At least two openings should have a defensible advantage, and the fastest should encounter the intended human decision.

## High — Hidden thresholds can make the deadline feel arbitrary

The game shows exact resources and a ten-minute deadline but gives only observed words for a worker's condition. That boundary can work. However, the concept gives no readable recovery horizon, advance warning before refusal, or indication whether a replacement crew can finish in time. A player can understand why someone stopped and still lack the information needed to make a useful decision. At four-times speed, a late warning makes this worse.

**Recommendation:** Define qualitative cues with actionable meanings: working comfortably, needs relief soon, recovering, ready to resume. Show work progress and whether a work order is active, suspended, or refused. Give the first warning enough lead time to rotate workers at Steady and Fast. Avoid a hidden irreversible loss before the player has seen a workable remedy.

**Acceptance evidence:** A new player can explain who needs relief, what action will help, and whether that action took effect without seeing private HF values.

## High — Ordinary RTS input can be mistaken for mistreatment

Remembered treatment follows “repeated urgent orders while exhausted,” but the controls define only ordinary right-click/long-press orders. RTS players repeat commands to correct targeting, move a group, recover a missed click, or confirm responsiveness. If those inputs create social penalties, the interface punishes normal use. If an ordinary order is implicitly urgent, the player cannot choose a respectful request.

**Recommendation:** Define the exact player action that counts as urgency. Reissuing an unchanged order should be idempotent for treatment. Separate correction of a destination from an explicit insist/push action. Explain an actual refusal through both speech and persistent order status.

**Acceptance evidence:** Repeated identical inputs and replacement destination inputs do not create unexpected treatment penalties. The player can intentionally choose urgency and predict the immediate consequence.

## Medium — Rest can turn into a mandatory clicking cycle

The stated remedy is to select exhausted people, rest them, and resume after a short recovery. If every worker repeatedly needs the same intervention, five to seven units become a timer-management exercise. Auto-resume helps, but the design does not say whether villagers rest themselves, whether mixed groups preserve individual tasks, or whether a player must babysit every cycle. That can crowd out the production and building decisions that establish RTS flow.

**Recommendation:** Specify individual suspended orders and the behavior of a mixed group receiving Rest. Let routine recovery complete without another click. Make manual rotation improve a plan rather than be the sole way to prevent workers from repeatedly stopping.

**Acceptance evidence:** A two-minute midgame interval contains consequential allocation choices and does not require repeating the same rest command solely to keep production alive.

## Medium — The phone map may hide the information needed for group control

At 360×690, the whole map, resource strip, deadline, controls, named chips, and selected sheet must fit without document scrolling. Five distinct people need readable positions and resource targets, while drag selection and long-press compete for the same map surface. The concept offers useful fallback buttons but does not establish that the map remains large enough for the opening actions.

**Recommendation:** Test the full opening at the actual phone size with the selected panel open. Provide explicit resource-order buttons when a resource target is hard to hit. Preserve visible map selection and order feedback while the sheet scrolls.

**Acceptance evidence:** On touch, a tester can select a subset, send it to stone, rest one person, and place a building without accidental orders or closing the panel to discover who is selected.

## Medium — The storm test lacks a stated outcome rule

“The storm tests the completed storehouse” leaves unclear whether completion alone wins, whether shelter capacity matters, or whether food, population, worker health, and treatment affect the result. Players need a literal objective to judge tradeoffs. A tally introduced only at the end could make efficient but humane choices feel secretly scored.

**Recommendation:** State the win condition before play. Separate the required construction result from descriptive outcomes about people. If other conditions matter, expose them in the objective before they can determine a loss.

**Acceptance evidence:** A tester can state the loss and win conditions before the first work assignment, and the ending applies those same conditions.

## Verdict

The small map and single deadline are a plausible scope for a playable RTS slice. The largest unresolved issue is whether its resource economy actually makes listening useful. Validate the shortest winning strategy first, then verify that human-state feedback supports decisions without requiring private numeric meters.
