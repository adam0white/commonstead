# Wildcard concept review

Reviewer perspective: a community garden coordinator who has never played a real-time strategy game. This is a review of `docs/concept.md`, not a playtest. The controls and their presentation remain unverified.

## Findings

### W1 — High: the first useful order assumes knowledge I do not have

The opening asks me to box-select people and right-click or long-press trees. As a new player, I would first tap a tree and expect a harvest button. “Choose who stays on food” also assumes I understand that selecting people and selecting a destination are separate steps. The named chips help me select a person but do not, by themselves, explain how to assign work.

Concrete change: show one short instruction before the first assignment: “Select a person, then choose Gather and tap a resource.” Make the explicit action buttons a complete route through gathering, movement and construction on both devices. Keep the destination marker and give its text a person's name and task, such as “Mira: gathering wood.” I should be able to finish the first minute without discovering a gesture.

### W2 — High: I cannot judge whether my group will survive the storm

The objective has a time and a price, but the concept does not explain what the storm does or what a completed storehouse protects. Does an unfinished roof injure people, lose food, or simply end the round? Is a house shelter, a population limit, or both? As a coordinator, I might prioritize housing to keep people safe and discover that the intended task was stone storage.

Concrete change: put a plain sentence beside the objective stating the storehouse's purpose and the consequence of missing the deadline. Say what houses provide. Keep storehouse material requirements and completion progress accessible from the objective before the player spends wood on a house. Explain the result at the end in the same terms used at the start.

### W3 — High: care can look like another way to increase output

The strongest idea is that a person explains why they slow down. However, the proposed response is largely to restore production through rest, food or replacement. A storm countdown and later refusals could teach me that people's needs are obstacles to manage. “All healthy workers obey promptly” is also a troubling opening promise for this persona: healthy people still have preferences.

Concrete change: let people's words acknowledge considerate treatment even when the project fails. In the ending, distinguish completion from how the group experienced the work. Do not turn care into a second score. Make clear whether “Offer a break” is a request, an instruction, or permission for an autonomous action. Show that a rest order is active and that work will resume, so I do not repeatedly interrupt someone because they appear idle.

### W4 — High: the phone gesture model needs a visible alternative

A tap selects, a drag selects several people, a stationary hold orders, and a placement tap builds. On a small map I expect to drag a person or move the view. A slight finger movement can also turn an intended hold into a drag. The concept specifies technical cancellation but not what I see while holding or how I recover from selecting the wrong people.

Concrete change: show a visible hold progress cue if long-press remains. Keep selected names and count visible. Provide a clear “Clear selection” control. Make “Select people → action button → target tap” work without a long-press or drag-box. Test this route with one hand at 360×690, including five selected people and the build sheet open.

### W5 — Medium: a scrolling selected sheet may hide the information needed for a decision

The map, stock strip, objective, deadline, person chips and action buttons all compete for 690 pixels of height. An internally scrolling sheet might hide either the person's explanation or the break button. “The whole map fits” does not establish that its people and targets remain distinguishable after the sheet opens.

Concrete change: keep the selected person's current task, latest explanation and primary action together in the first sheet view. Keep the deadline visible. Verify resource targeting with the sheet open and confirm that a finger does not cover the target confirmation. Record what remains visible at the required phone size.

### W6 — Medium: the countdown makes experimenting costly unless pause is discoverable

The game gives me ten minutes to learn unfamiliar controls and then judges my choices. The concept says menus pause, but a novice may assume time continues or may not know where the menu is.

Concrete change: label the menu entry “Pause” and show “Paused” prominently when open. Put controls help there. Make it clear before starting that I can pause to read and inspect controls. Keep the storm warning at 8:00 as reinforcement; do not make it the first clear explanation of the deadline.

## What already works

Five named people, visible order confirmation, spoken causes, an unobstructed map and an ending with people's words make this approachable. No compulsory tutorial dialog is compatible with brief instructions beside the first relevant controls. Rest in place and automatic return to work reduce the amount of coordination I must perform.

## Suggested acceptance check

Give a first-time player only the title screen. On a phone, ask them to assign one person to wood, assign two others to stone, start the storehouse, give someone a break and pause. Do not name gestures. Ask them what the storm will do, why a worker slowed down and whether that worker will resume. Observe errors and answers before explaining anything.
