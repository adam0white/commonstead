# Commonstead second same-tester retest, 2026-10-27

- **Build tested:** live https://commonstead.adamwhite.work at `36e0640` (`/release.json` `dirty:false`, app 0.2.0, framework 3.0.0), opened with `?labRunSource=agent`.
- **Previous round:** the 2026-10-27 same-tester retest at `fe433b8` (`docs/games/commonstead-playtest-2026-10-27.md`). Before that, R1 (hf3-commonstead-2026-10-25; evidence in human-framework `docs/lab/reviews/hf3-commonstead-2026-10-25/`).
- **Testers:** the same 14 lab-panel personas: Maya, Emre, Nia, Rosa, Jonas, Aisha, Diego, Mei, Samir, Tessa, Pavel and Leila (standing), and Alina Popescu and Julio Romero (cold slots).
  - Each tester was a persona agent that had read only its own previous report. The model that ran this round is not recorded in plan.json or the reports.
- **Method:** the harness lab driver. Each tester played two fresh sessions, 360x690 touch phone and 1280x800 desktop, both in light mode. The floor was 0, the ceiling 20 minutes, and testers stopped freely. Recording stayed on, and runs are labelled as agents. No tester submitted feedback text.
  - Every session is a driver session (ruling 4): the driver ran a real browser and tapped by control name or by point. No session was played by hand.
  - Every session was planned against `36e0640`, and `/release.json` showed `36e0640` when this head was written. A mid-round deploy was not checked session by session (ruling 1).
- **This is a fictional lab panel.** It is not evidence about recruited players or a population.
- **Caveats:**
  - Some testers' own-history files may have been cut by the Read tool's line cap. This is unverified for this game.
  - Several testers misstated their own elapsed time. Alina said "about 5 min" on desktop; the driver says 166 s. Julio said "about 9" on desktop; the driver says 400 s. Rosa said 10 to 12 minutes on the phone; the driver says 194 s. Leila said "about 6" on the phone; the driver says 241 s. The ledger uses the driver's times.
  - 19 of 28 sessions carry a second stop line, `BUDGET` at 1200 s, after the tester's own stop. This includes sessions that reached the 10:00 ending. The first stop line is the tester's, and it is the one that counts. The cause of the second line was not checked.
  - Not everyone played the default day. Emre and Julio played the longer settlement day on desktop. Nia played the personal-replies day on the phone and the resident-conversations day on desktop. Tessa played the personal-replies day on desktop. Leila reached the personal-replies day on desktop only after finishing a standard day.
  - Mei and Julio drove the driver through their own small shell wrappers. Pavel did not open Feedback on desktop.
  - The reports were saved by the coordinator from each agent's final reply, because the agents' own file writes were refused.
  - The previous retest doc assigned no F-numbers. Asks first raised there have no earlier F-number, so they count as new here. Each such ask says "first raised retests-1027, unnumbered there".
  - Disposition judgment calls: Diego's "but only because" gives a reason, not a condition, so he is keep. Pavel's top sentence has no condition, but his section 7 says "Conditions: a game that is not just the same ten minutes again", so he is mixed. Julio's yes carries "unless the repeat disputes get a readable cause", so he is mixed. Nia and Alina follow last round's rulings on the same sentence shapes (quit and keep).

## Verdict: finished (iteration 2)

This is the second same-tester retest. By the owner's playtest rule the game is finished after two iterations, whatever the asks. Every remaining ask below goes to the Deferred list with a date.

A **new blocking ask** has no earlier F-number and is tied to a quit or mixed return sentence: the sentence names it, or it is that tester's first ranked ask.

- Dispositions: 2 keep, 11 mixed, 1 quit.

### New blocking asks (would have opened a fix cycle)

1. **F-781: The whole-group orders stop work without warning.** "Everyone rests" and "Everyone under a roof" are new at `36e0640`.
   - Leila: "I ordered everyone under a roof at 6:49 and that stopped the building at 56%; my own mistake, but nothing told me roof-ordering halts assembly."
   - Pavel (first ask): "Under a roof, people went idle with no task and I had to order work again. The page said "Work will resume after the break" when it did not."
   - Alina: "It seemed to rest only one person on both devices." This is one tester, and Pavel says both orders "work on all eight at once". Unverified.
   - **Proposed fix:** say on the button what it stops, and after the rest or the roof put each person back on their earlier work.
2. **F-782: The conversation controls hide inside folded sections.** On the standard day they sit in "About this resident". On the replies day the invite sits in "Travel, conversations and the day". First raised retests-1027 by Aisha and Nia, unnumbered there.
   - Nia (first ask): "Put "Invite a private story" and the Say buttons beside the selected person".
   - Nia: "The invite is still inside a collapsed group."
   - Mei: "The conversation controls inside a folded section. This is the biggest problem this visit."
   - Aisha: "For each new person, Invite conversation is again missing until I open About this resident."
   - Tessa: the sections "fold shut by themselves between taps".
   - Confirmed in the jsonl: Aisha's desktop log has five "Invite conversation is not on the page now" refusals, and Maya and Tessa have one each. This is a real fold in the game, not a driver limit.
   - **Proposed fix:** whenever one resident is selected, show Invite and Offer directly under the name, outside any fold.
3. **F-783: The private-story invite waits for "one minute of play at Steady" with no counter.**
   - Nia (in her return condition): "if there were someone to talk to within the first two minutes".
   - Nia: "The waiting for one minute at Steady, with nothing shown to count it."
   - Leila: "Fast is the default here, so the minute counts at Steady only. … A bit odd that the speed matters."
   - **Proposed fix:** show the wait as a countdown in game seconds, and count it at every speed.
4. **F-784: After the resident answers, the player cannot reply again.** Related to F-742 (one reply), which is now met on the replies day.
   - Nia (in her return condition): "my chosen line got an answer I could reply to again".
   - Nia: "I still cannot reply again, and "attended the line" is still in the text."
   - **Proposed fix:** after the resident's answer, offer one more reply with its own answer.
5. **F-785: One resident's finished work never shows in another resident's story.** This is distinct from F-763, which asks for the same person's second conversation.
   - Maya (in her return condition): "if something I do with one person shows up in another person's story (for example Nora answering Dai's inspection card)".
   - Maya: "Dai card said it leaves room for Nora and Nora never mentioned it."
   - **Proposed fix:** when Dai writes the inspection card, add one line to Nora's chapter that answers it.
6. **F-786: The pause menu has no way back to the title page.**
   - Leila (first ask): "the pause menu has no way back to the title page, so I reached it only by finishing a day first."
   - **Proposed fix:** add "Back to the title page" to the pause menu, under New game.
7. **F-787: The placement and help sentences use words a plain reader does not know.** First raised retests-1027 by Rosa, unnumbered there.
   - Rosa (in her return condition): "the wording on the placement screen were plainer".
   - Rosa: "I do not know what open centres or candidate site mean."
   - Rosa, on the help: "Wait five game seconds during that break. Still do not know what I wait for."
   - **Proposed fix:** write "Dots show where the storehouse can stand. The outline shows its size." Say in the help what the five seconds wait for.

### Still open from earlier rounds

- **F-765 and F-778: long-day trolley disputes return after every yield, and the boards crew stalls.** Emre's and Julio's return conditions both name this.
  - Emre: "I would not come back until I can see what keeps the route blocked and why my yields only held for an hour."
  - Julio: "a fresh dispute 6 game seconds after every accepted yield, with no stated cause. It makes yielding feel pointless."
  - Julio: "Boards stuck at 101 of 180 with no explanation."
  - Met in part: the dispute now names its pair, and a refused yield gives its reason.
- **F-776: say whether the long-day goal can still be reached.** Julio: "no way the goal is reachable at this rate."
- **F-764: closing lines still share sentences.** First raised in R1; the 2026-10-27 retest's blocking ask 2. Partly met.
  - Mei: "The first sentence is now individual, but the last two sentences are the same for everyone."
  - Diego: "All eight still start with "You gave me a break when I needed one.""
  - Emre, on the long day: "I cannot keep my eyes open. I need to go to bed." five times.
- **F-772 and F-745: a harder or varied second run.** The conditions of Jonas, Mei and Samir name this.
  - Jonas: "I have now won this scenario three times and would not replay it unchanged."
  - Samir: "the conversations and endings are identical each time."
  - Emre, on the long day: "After the storm, 11 game hours of waiting."
- **F-763: a second conversation that follows the first.** Aisha's condition: "only if the residents have something new to say or do on a later day".
- **F-746 and F-719: a reply on the standard day.**
  - Leila: "Put a reply into the standard ten-minute day."
  - Tessa: "Give Dai a reply on the plain New game too."
- **F-733 and F-736: the resident text pane is a small scroll window.**
  - Tessa: "the reply buttons sat in a tiny scroll strip of about 190 px."
  - Nia: "The desktop pane is still about 150 px tall."
  - Maya, Mei and Leila said the same. This was blocking ask 4 of the 2026-10-27 retest.
- **F-724: every resident runs the same rest, wait, invite, collaborate route.** Maya: "Nerys, Dai, Nora and Sevim all ran it identically."
- **F-748: the paired talk gives one dry line.** Nia: "Sam and Dai talking produced only "They do not pass on an account of the supplies.""
- **F-730: nothing to decide in the building stretch.** Samir: "Both runs were a wait with one Rest press, and meals never ran short."
- **F-749 and F-771: the tally teaches nothing.** Jonas: "At the end it reads only "8 people · 1 completed buildings"."
- **F-775: the off-dots placement refusal is still generic.** Diego: "Off-dots tap refused with the same generic line, still does not say off the dots."
- **F-769 and F-729: the phone map is covered outside placement.** Alina: "The storehouse was half under the caption." Diego: "the speed row still sits on it".
- **F-734: more to do with the place after the cabins.** Tessa: "Invite helper costs 35 meals and I had 30."
- **F-752: tiredness comes back fast and rests seem to do little.** Pavel and Rosa.
- **F-698: selection stays after an order.** Mei: "On the first order I sent three people to meals by mistake."
- **F-780: reply-day words are heavy.** Leila: ""heard accounts", "observed events", "Quay and records desk", "post slot"".

### Smaller asks

- **F-788: the phone name row runs off the right edge, and the hub label sits under the people.** First raised retests-1027 by Jonas and Emre, unnumbered there.
  - Jonas: "name row clipped at Sevim again". Emre, Aisha, Pavel, Julio, Samir and Tessa said the same.
  - Jonas also: "The "Now:" line is out of sight under the work buttons."
- **F-789: give the two reply buttons distinct labels.** Both read "Say this to Nora" (or Sevim). This is a ruling 8 item; see the harness notes.
- **F-790: "Move / add builders" enters a placement mode without saying so.** Emre: "Make "Move / add builders" say it opens a placement mode, and say Cancel is how to leave it."
- **F-791: say when boards or bags are enough.** Diego: "nothing told me I had enough, so I wasted effort." Pavel: ballast reached 149 of 120.
- **F-792: "1 completed buildings" in the tally.** Rosa: "the number is right but grammar looks wrong."
- **F-793: warn during the day when the storm meals are short.** Alina: "having no warning that the phone run was ending with only 2 meals."
- **F-794: the recording notice covers the bottom controls.** Diego, Mei, Samir, Leila, Julio and Pavel saw it.
  - Commonstead vendors lab-kit 0.5.12. Human-framework `818c352` fixes this in lab-kit. Whether a kit release with that fix exists yet is unverified.
  - Proposed fix: adopt the first kit release that carries `818c352`.

### Met, in the testers' words

- **The commander walk is gone** (2026-10-27 blocking ask 1).
  - Tessa: "No commander, no walk, panel stayed."
  - Leila: "The reply I wanted works: I said the line, Nora answered in her own words".
  - Nia: "First line got a different answer … So my choice matters."
- **The Storehouse button says why it is grey** (blocking ask 3). Julio: "the grey Storehouse button stated its reason ("ballast bags 105 of 120")". Rosa, Jonas, Aisha, Diego and Samir said the same.
- **Eat and drink states its cost, and the screen says what cures tiredness** (blocking ask 5, first half).
  - Samir: "Both sentences are on the main panel from the start".
  - Alina: "Meals do not lower tiredness. A rest does, though one rest may not be enough."
- **Group rest and shelter exist** (blocking ask 5, second half). Pavel: "do it for all eight in one tap." F-781 records the remaining fault.
- **Carried boards no longer block a story** (blocking ask 6). Nia: "The story was no longer blocked by carried boards."
- **Closing lines now carry each resident's own day, in part** (blocking ask 2). Samir: "each resident now echoes what they admitted or did with me". Jonas: they "mention breaks only for those I rested". F-764 records the shared sentences.
- **The phone map is taller in normal play, in part** (blocking ask 4). Mei: "The strip behind the buttons from last time is gone." Alina says it still turns into a strip after scrolling.
- **Smaller items met:** the dispute names its pair (Julio); the intro typo is fixed (Rosa, Alina); help opens at the top (Rosa).

### Harness notes

- **Ruling 8, same-name buttons:** Leila's desktop log has three refusals, "2 enabled controls are named Say this to Nora". Tessa's has eleven, for Nora and Sevim. These are driver refusals. Both testers then tapped by point, and the replies worked. Routed only as the minor F-789.
- **"Not on the page" refusals:** "Invite conversation" (Aisha 5, Maya 1, Tessa 1) and "About this resident" (Alina 2, Samir 1). These are game state: the controls sit inside a closed fold. They support F-782.
- **Disabled-control taps:** Samir's phone log has twelve taps on a disabled "Offer a small collaboration" while he waited for the break. Mei's has three. The Storehouse was tapped while disabled several times. All are game state, with a stated reason on screen.
- **Ruling 5:** no tester raised a tap-timing complaint, and nobody reproduced one at human speed. Tap op_ms across all 28 sessions ranged from 3 to 1541 ms, median 149, 95th percentile 170. The 20 to 30 s op_ms values are `wait` ops.
- **Tool limits:** the driver has no drag, box select or right-click, so Rosa and Alina did not try those. Pavel hit the 30 s cap on `wait`. Unsupported `ping` and `find` ops were tester errors. Aisha had one "Pause menu covered" refusal.
- **Layout shift:** Tessa saw a screenshot taken a few seconds after a driver reply show a different layout than the reply's point. Unverified.

## Tester ledger

Disposition: keep is yes with no condition; mixed is yes or maybe with a condition; quit is a sentence that opens with no or not tonight. Session times are the driver's elapsed seconds at the stop line, not the player's own estimate.

| tester         | commit  | sessions (device, stop reason, driver time)        | return sentence                                                                                                                                                                                                                                                                                                                                                                                                                                       | disposition |
| -------------- | ------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Maya Chen      | 36e0640 | phone BORED at 157 s; desktop BORED at 83 s        | I would come back another evening, on my phone, if something I do with one person shows up in another person's story (for example Nora answering Dai's inspection card). Without that I would not come back, because three residents tonight gave me the same four steps and three stories that never touch. I would not leave it running, and I would not return tonight.                                                                            | mixed       |
| Emre Kaya      | 36e0640 | desktop FINISHED at 539 s; phone FINISHED at 178 s | "I would return voluntarily if the longer day keeps giving me a problem I can solve, because the trolley disputes were a real puzzle, but I would not come back until I can see what keeps the route blocked and why my yields only held for an hour."                                                                                                                                                                                                | mixed       |
| Nia Okafor     | 36e0640 | phone BORED at 274 s; desktop BORED at 255 s       | "I would not come back tonight, but I would come back another evening if there were someone to talk to within the first two minutes, the Say buttons sat beside the person instead of in a small scroll pane, and my chosen line got an answer I could reply to again, because Nora writing 'Would this grip help you use the handle?' and Sevim leaving his answer unwritten were the two moments I wanted. I would close it, not leave it running." | quit        |
| Rosa Alvarez   | 36e0640 | phone FINISHED at 194 s; desktop FINISHED at 170 s | "I would come back another evening, on my own, for a second day, if it stayed this short and the wording on the placement screen were plainer. I would not leave it running while I do something else, because the people stop and wait for my orders and the day ends at 10:00 either way."                                                                                                                                                          | mixed       |
| Jonas Berg     | 36e0640 | desktop FINISHED at 518 s; phone FINISHED at 424 s | I would return voluntarily only if the next run were different or harder (a changed starting state, a storm that varies, or a goal beyond "finish before 10:00" with everyone under a roof). I have now won this scenario three times and would not replay it unchanged. I would not leave it running. I might come back another evening on those same conditions.                                                                                    | mixed       |
| Aisha Rahman   | 36e0640 | desktop BORED at 319 s; phone BORED at 195 s       | "Yes, another evening, but only if the residents have something new to say or do on a later day; I have now heard every one of their single stories twice, and a storehouse that builds itself gives me nothing to come back for. I would not leave it running."                                                                                                                                                                                      | mixed       |
| Diego Silva    | 36e0640 | desktop FINISHED at 177 s; phone FINISHED at 160 s | "I would come back one more evening to run it tighter and lose it on purpose, but only because the end lines now differ per resident and a loss is possible. I would not leave it running, and a run of three to six minutes is short enough that I would not come back the same night."                                                                                                                                                              | keep        |
| Mei Tan        | 36e0640 | desktop FINISHED at 616 s; phone FINISHED at 617 s | Yes, but only for a different day. I would come back another evening if the game offered something new, such as the longer day, because I have now seen the storm and the ending twice. I would not leave it running. I would not replay this same day.                                                                                                                                                                                               | mixed       |
| Samir Haddad   | 36e0640 | desktop FINISHED at 617 s; phone FINISHED at 640 s | I would come back another evening on desktop, because the endings now carry what each resident told me. I would not leave it running, and I would only come back for new content, such as new confessions or collaboration shapes, since I have now heard all eight.                                                                                                                                                                                  | mixed       |
| Tessa Williams | 36e0640 | phone TASTE at 82 s; desktop TASTE at 162 s        | Yes, but only on the personal-replies day, and only if there were more residents with stories to answer. I would not come back for the plain ten-minute game. I would not leave either one running. I'd come back another evening only if I knew new stories were waiting.                                                                                                                                                                            | mixed       |
| Pavel Novak    | 36e0640 | desktop FINISHED at 618 s; phone FINISHED at 615 s | Yes, I would return voluntarily, but not tonight and I would not leave it running. I would come back another evening on the desktop to try a different split of the work, since I won both runs and the day is now short. My own history says "maybe, if I could learn how to keep eight people from all getting tired at once", and this visit gave me the means to do that.                                                                         | mixed       |
| Leila Mansour  | 36e0640 | phone FINISHED at 241 s; desktop FINISHED at 342 s | I would return voluntarily, on one evening at least: this time Nora answered a reply I chose, which is what I asked for, so I would come back for more of that. I would not leave it running, because it needs me to act. I would also want the standard ten-minute day to offer a reply.                                                                                                                                                             | mixed       |
| Alina Popescu  | 36e0640 | phone FINISHED at 206 s; desktop FINISHED at 166 s | Yes. I would come back on a computer one more evening to talk to the residents I have not met yet: Nera, Dai, Burak, Dilek, Sam and Oskar. Sevim's conversation is what made me want that. I would not play it on my phone for the map, and I would not leave it running. The game only moves while I give orders or watch it.                                                                                                                        | keep        |
| Julio Romero   | 36e0640 | desktop CONFUSED at 400 s; phone FINISHED at 179 s | Yes, to the ten-minute day on the phone, for one more evening, because the storehouse now works and I want to finish it. I would not return to the long day unprompted unless the repeat disputes get a readable cause. I would not leave either one running by itself.                                                                                                                                                                               | mixed       |

## Player words

Each tester's return answer and ranked asks are their report's own words. The diary rows are the raw driver diary (`wall-clock.jsonl`), every line that carried words, unedited. Coordinator paths are shortened.

### Maya Chen

**Would you return voluntarily?** I would come back another evening, on my phone, if something I do with one person shows up in another person's story (for example Nora answering Dai's inspection card). Without that I would not come back, because three residents tonight gave me the same four steps and three stories that never touch. I would not leave it running, and I would not return tonight.

**Ranked asks:**
1. Let one person's finished collaboration show in another person's text or on the map. Dai's card says "leaves room for Nora to question it", but Nora's own chapter never mentions it.
2. Vary the rest, wait, invite, collaborate route between residents. Nerys, Dai, Nora and Sevim all ran it identically.
3. On desktop, give the resident text more room than the thin strip between the instructions and the buttons.

**Phone (360x690 touch phone)**

| elapsed s | entry                           | reason | game clock             | words                                                                                                                                                                                                                                     |
| --------- | ------------------------------- | ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.9       | tap New game                    |        |                        | Back again. New game.                                                                                                                                                                                                                     |
| 5.5       | tap Nerys                       |        |                        | Nerys and the telescope again.                                                                                                                                                                                                            |
| 11.4      | tap Ballast bags                |        |                        | The page says wait until 1:00, no shared location. Same as last time; I will give her work while waiting.                                                                                                                                 |
| 41.5      | first_minute                    |        | about 0:40             | Nerys is hauling ballast bags and the page tells me what conversation needs. Calm and readable, but it is the same screen as last time so far.                                                                                            |
| 69.9      | tap Rest, then resume           |        |                        | She is tired; the page says offer a break, then invite conversation during it.                                                                                                                                                            |
| 80.5      | tap Offer a small collaboration |        |                        | Telescope line again, and the page tells me to offer the collaboration. Doing it.                                                                                                                                                         |
| 83.8      | pulse 3                         |        | about 2:00             | The collaboration gave the dark-corner line and then the chapter says it is over. Same payoff as last time. Is there a mark on the map? I do not see one.                                                                                 |
| 84.0      | tap Dai                         |        |                        | Trying Dai, to see if he differs.                                                                                                                                                                                                         |
| 86.6      | tap Boards                      |        |                        | Giving Dai boards while he waits for his conversation window.                                                                                                                                                                             |
| 129.0     | tap                             |        |                        | The conversation buttons are hidden until I open About this resident; I had to remember that.                                                                                                                                             |
| 133.6     | pulse 4                         |        | about 4:00             | Dai admits he liked being needed and wrote an inspection card leaving room for Nora to question it. I want to see what Nora does with that.                                                                                               |
| 134.0     | tap Nora                        |        |                        | Checking whether Nora reacts to Dai card.                                                                                                                                                                                                 |
| 149.6     | want_quit                       | BORED  | about 6:00             | Nora has her own handle story. Nothing about Dai card. Three people, same four steps, three separate small stories that do not touch each other. I would stop here.                                                                       |
| 157.1     | stop                            | BORED  | about 2:30 on the page | I am stopping on the phone. Nerys, Dai and Nora each gave me a small private story, and I liked the lines, but they do not touch each other and the map shows nothing. Dai card said it leaves room for Nora and Nora never mentioned it. |

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry        | reason | game clock | words                                                                                                                                                                               |
| --------- | ------------ | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.6       | tap New game |        |            | Second visit tonight, on desktop. New game.                                                                                                                                         |
| 4.3       | tap          |        |            | Map is big and clear here. Tapping a figure.                                                                                                                                        |
| 8.0       | tap Sevim    |        |            | Dai again from my phone; trying Sevim, someone I have not met.                                                                                                                      |
| 12.0      | first_minute |        | 0:20       | Map is large and I can see where everyone is. Sevim is a new face for me. The right panel is a tall scrolling column, I have to scroll to find controls.                            |
| 79.7      | pulse 4      |        | about 1:50 | Sevim has a real secret: she called a pupil lazy before knowing he cared for a sick parent. Her note is a private draft, not a letter. That hit me more than anything on the phone. |
| 79.7      | want_quit    | BORED  | about 2:00 | Sevim shows me the same four steps again and her story is again a private action that changes nothing on the map. The lines are good; the loop is the same. I would leave here.     |
| 83.2      | stop         | BORED  |            | I am stopping on desktop after Sevim. The map is much better here and Sevim line stayed with me, but I have seen the loop three times tonight and nothing links the people.         |


### Emre Kaya

**"I would return voluntarily if the longer day keeps giving me a problem I can solve, because the trolley disputes were a real puzzle, but I would not come back until I can see what keeps the route blocked and why my yields only held for an hour."**

**Ranked asks**
1. Show why the trolley route is blocked and what I did wrong. Make a yield last, or say what made the next quarrel start. I patched one dispute at a time and could not plan.
2. In the long day, keep the end screen personal. The ten-minute ending is better now. The long-day ending gave every resident a tiredness line and nothing about what they did.
3. On the phone, keep the names row from cutting off Sevim. Make "Move / add builders" say it opens a placement mode, and say Cancel is how to leave it.

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry                                | reason     | game clock     | words                                                                                                                                                                                                                                                                                      |
| --------- | ------------------------------------ | ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.2       | tap                                  |            |                | Title now offers other starts. My last wish was a second day, so I open the longer settlement day.                                                                                                                                                                                         |
| 5.9       | tap Start a settlement day           |            |                | Thirty minutes at Steady is long, but Fast exists. Trying it.                                                                                                                                                                                                                              |
| 16.4      | tap Ballast bags                     |            |                | Four on boards, four on bags. Time already moves while I click, 08:04.                                                                                                                                                                                                                     |
| 35.2      | first_minute                         |            | 08:?           | Clear goal, costs, storm at 20:00, cabin hint. Boards and bags crews set. I want to see how the long day differs from the short one; no explanation of what I do between work yet.                                                                                                         |
| 78.3      | tap Clear                            |            |                | A trolley route dispute between Sam and Nora is why nobody hauls. This is a real problem, and it is the first thing I understand to solve.                                                                                                                                                 |
| 90.6      | pulse 3                              |            | 11:35          | A real obstacle: a trolley dispute blocks all hauling. I asked Sam to yield but the request is just that, a request, and I cannot tell if he will. I see nobody working.                                                                                                                   |
| 116.7     | tap Clear                            |            |                | Sam yielded after the talk. Route open. Re-ordering crews.                                                                                                                                                                                                                                 |
| 143.0     | tap Offer to yield the trolley route |            |                | Another dispute, Nerys and Dai, on the same route. Dai yields this time. It repeats; I would like to know why.                                                                                                                                                                             |
| 171.8     | pulse 3                              |            | 13:34          | Midday, 94 boards and no bags. The disputes keep blocking work and I am clicking offers rather than planning. It is a puzzle but a small one. I have not lost anything yet to explain.                                                                                                     |
| 230.9     | tap Offer a voluntary practice bout  |            |                | Trying the practice bout to see if it settles the dispute for longer; I am guessing what it does.                                                                                                                                                                                          |
| 242.9     | want_quit                            | FRUSTRATED | 16:55          | 17:00, 101 boards and zero bags. Each yield opens the route for about an hour, then another pair quarrels and everybody rests. I cannot work out what I should have done differently, and I do not know what the storm costs. I would like to see how it ends, so I continue on Fast.      |
| 315.9     | note                                 |            | 20:32          | The storm came at 20:00 and soaked the supplies: boards 101 to 50, meals 70 to 28. The day does not end; it runs to 08:00. I can accept this loss, because I know I did not get bags moving. But I did not know the disputes would eat the afternoon.                                      |
| 392.9     | pulse 2                              |            | 00:44          | Night. Nothing to do but wait for 08:00. I tried all on boards, nothing moved; they sleep. The first half was a puzzle, the second half is watching a clock.                                                                                                                               |
| 538.9     | tap I'm confused                     |            |                | What confuses me: why gathering stopped all afternoon while I clicked yields, and the ending shows only tired lines.                                                                                                                                                                       |
| 538.9     | stop                                 | FINISHED   | 08:00 tomorrow | Longer day ended at 08:00 with a lost storehouse and soaked supplies. I lost to disputes I could only patch one at a time, and the end screen gave every resident a tiredness line, not what they did. I would try the longer day again only if I could tell what keeps the route blocked. |

**Phone (360x690 touch phone)**

| elapsed s | entry                            | reason     | game clock | words                                                                                                                                                                                                                  |
| --------- | -------------------------------- | ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1       | tap New game                     |            |            | Phone, same evening. Short game this time, to compare with desktop.                                                                                                                                                    |
| 42.7      | first_minute                     |            | ~1:00      | Short game on the phone: map is taller than I remember, the full goal and the 40-meal need are on screen. Names row still scrolls sideways; Sevim is cut off. Crews set in 10 seconds.                                 |
| 68.5      | tap                              |            |            | Tapping open ground on the map to place the storehouse.                                                                                                                                                                |
| 78.5      | TOOL tap                         |            |            | Everybody is tired, resting them all then they go back to the storehouse.                                                                                                                                              |
| 108.0     | tap Cancel placement or movement |            |            | I never meant to enter placement mode; Move / add builders put me there. Cancelling.                                                                                                                                   |
| 108.2     | pulse 3                          |            | 6:30       | Same plan as desktop works and the phone is playable now. Wrongly entered a placement mode and was stuck until I found Cancel. I was never told which of my crews was already building.                                |
| 177.3     | want_quit                        | FRUSTRATED | 10:00      | Lost with 60 percent built at 8:52 and nobody indoors. Mine was the mistake, but nothing told me five builders at tired pace were not enough. I read the endings with interest.                                        |
| 177.8     | stop                             | FINISHED   |            | Short game lost on the phone: storehouse unfinished, everyone soaked. Endings now differ per resident after one shared opening line, which I like. Phone is better than I remember but names row still cuts off Sevim. |


### Nia Okafor

**Would you return (exact sentence):** "I would not come back tonight, but I would come back another evening if there were someone to talk to within the first two minutes, the Say buttons sat beside the person instead of in a small scroll pane, and my chosen line got an answer I could reply to again, because Nora writing 'Would this grip help you use the handle?' and Sevim leaving his answer unwritten were the two moments I wanted. I would close it, not leave it running."

**Ranked asks**
1. Put "Invite a private story" and the Say buttons beside the selected person, in a pane big enough to read without scrolling. Phone first. The desktop pane is still about 150 px tall.
2. After my line, let the resident answer me and let me reply again. Right now the line ends at "attended the line" plus one written sentence, and the game says the answer "is still unwritten."
3. Give building and group talk some visible payoff in the first five minutes. Four people on Boards took 87 of 180 after minutes at Fast. Sam and Dai talking produced only "They do not pass on an account of the supplies."

**Phone (360x690 touch phone)**

| elapsed s | entry                                  | reason | game clock   | words                                                                                                                                                                                                                                                                               |
| --------- | -------------------------------------- | ------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.7       | tap                                    |        |              | Same personal replies start as last time; I want someone to talk to me.                                                                                                                                                                                                             |
| 7.7       | tap Nora                               |        |              | Tapping Nora straight away for a personal reply.                                                                                                                                                                                                                                    |
| 11.7      | tap                                    |        |              | Invite button was in this collapsed group last time; opening it.                                                                                                                                                                                                                    |
| 14.2      | tap Invite a private story             |        |              | Inviting Nora to share a story.                                                                                                                                                                                                                                                     |
| 27.6      | first_minute                           |        | 08:12        | Picked personal replies, tapped Nora, found the invite in the collapsed group again. I invited her; clock moved 08:07 and she is still resting and saying she sees no reason not to do this. Nothing yet, waiting.                                                                  |
| 42.2      | tap Fast                               |        |              | Impatient: speeding up so the one-minute wait passes.                                                                                                                                                                                                                               |
| 51.6      | tap Steady                             |        |              | Rule says Steady counts; going back to Steady.                                                                                                                                                                                                                                      |
| 51.8      | tap Boards                             |        |              | Putting Nora on boards while I wait.                                                                                                                                                                                                                                                |
| 69.5      | tap Invite a private story             |        |              | Trying the invite again.                                                                                                                                                                                                                                                            |
| 82.6      | tap Bring carried materials to the hub |        |              | There is a new button for carried boards; using it so the story is not blocked.                                                                                                                                                                                                     |
| 96.8      | wait                                   |        |              | Waiting for Nora to deliver.                                                                                                                                                                                                                                                        |
| 99.7      | tap Cancel selected tasks              |        |              | Cancelling her board loop so she can talk to me.                                                                                                                                                                                                                                    |
| 113.6     | pulse 3                                |        | 08:55        | Cancel then invite worked; Nora chose to tell me about leaving a feature off a handle design. Faster than last time, and no hub block. The invite is still hidden in the collapsed group.                                                                                           |
| 133.0     | tap                                    |        |              | Choosing the second line, write down what I still need to ask; that is how a designer would answer.                                                                                                                                                                                 |
| 157.6     | note                                   |        | 10:20        | That worked much quicker than last time: Nora wrote Would this grip help you use the handle? and said she has not asked them yet. No hub walking. I still had to scroll a lot to find the Say buttons, and the answer is still just a line, but it is the moment I liked last time. |
| 157.8     | tap Sevim                              |        |              | Trying Sevim, the other person with a private story.                                                                                                                                                                                                                                |
| 189.5     | tap Sevim                              |        |              | Sevim is waiting for me; selecting her to read it.                                                                                                                                                                                                                                  |
| 210.8     | tap                                    |        |              | Leave room for his answer; that feels right.                                                                                                                                                                                                                                        |
| 262.6     | pulse 3                                |        | 11:40        | Both stories answered in about four minutes, no hub walk. I liked Sevim leaving his answer unwritten. But after the line, nothing else for me to do with them and nobody has built anything.                                                                                        |
| 270.9     | want_quit                              | BORED  | 11:50        | I got both personal moments, Nora and Sevim, in four minutes and it was smoother. Now there is just resource waiting and nobody builds. I would leave.                                                                                                                              |
| 273.7     | stop                                   | BORED  | 11:55 paused | Stopping on phone. Both stories answered fast, no hub walk, Nora wrote her question and Sevim left room for his answer. Then nothing to do but wait for boards. Would not leave it running. Feedback marked I am stopping and filled the box itself; nothing typed or submitted.    |

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry                         | reason | game clock   | words                                                                                                                                                                                                                                                            |
| --------- | ----------------------------- | ------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.3       | tap                           |        |              | Second visit on the laptop; trying resident conversations again, since I want people to talk to each other and to me.                                                                                                                                            |
| 11.9      | tap Dai                       |        |              | Desktop: picking Dai first.                                                                                                                                                                                                                                      |
| 12.4      | tap Invite two people to talk |        |              | Asking Dai and Sam to talk about the trolley route.                                                                                                                                                                                                              |
| 18.5      | first_minute                  |        | 08:20        | Big map again, a relief. Dai and Sam picked and invited to talk. The text pane at right is still a small window I have to scroll. Waiting for them to talk.                                                                                                      |
| 45.7      | tap Clear                     |        |              | Sam and Dai talking gave me just: They do not pass on an account of the supplies. That is nothing. Going to Nora.                                                                                                                                                |
| 90.3      | tap Invite a private story    |        |              | Trying the story invite again.                                                                                                                                                                                                                                   |
| 92.8      | pulse 3                       |        | 09:10        | Sam and Dai talk produced a dry line. Nora invited; waiting. No hub walk problem so far.                                                                                                                                                                         |
| 135.7     | tap                           |        |              | Trying the first line this time: put the grip back and mark the drawing unfinished.                                                                                                                                                                              |
| 183.8     | note                          |        | 11:00        | First line got a different answer: Nora put the grip back, marked it unfinished, and says she still needs to ask the user. So my choice matters. Nice. Still hunted in a tiny scroll window for the buttons.                                                     |
| 184.9     | tap Boards                    |        |              | Putting four people on boards and speeding up to see if anything gets built.                                                                                                                                                                                     |
| 251.3     | want_quit                     | BORED  | 13:45        | Boards 87 after minutes at Fast with four people; building is slow and I have already had my personal moment. I would leave now.                                                                                                                                 |
| 254.9     | stop                          | BORED  | 13:50 paused | Stopping on laptop. Nora answered my first line differently than the second, which I liked; Sam and Dai talking gave nothing. Building is slow. Would not leave it running. Feedback marked I am stopping and filled the box itself; nothing typed or submitted. |


### Rosa Alvarez

**Would you return voluntarily?** "I would come back another evening, on my own, for a second day, if it stayed this short and the wording on the placement screen were plainer. I would not leave it running while I do something else, because the people stop and wait for my orders and the day ends at 10:00 either way."

**Ranked asks**
1. Rewrite the placement text in plain words: "Dots mark open centres. The outline shows the candidate site and spacing. The game also checks selected people, busy residents, materials and an existing storehouse."
2. Fix "1 completed buildings" in the tally, and explain "Wait five game seconds during that break" in the help.
3. Make the phone map larger, and make "Everyone rests" less confusing. After I used it, people still showed "very tired" and kept working.

**Phone (360x690 touch phone)**

| elapsed s | entry            | reason   | game clock | words                                                                                                                                                                                                                         |
| --------- | ---------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.6       | tap New game     |          |            | Title is shorter and clear. Starting new game.                                                                                                                                                                                |
| 10.5      | first_minute     |          | 0:02       | I read Meals 30, Boards 80, People 8 / 10 housing spaces, and Names add or remove people. Clear on first reading. Everyone is already sent for boards.                                                                        |
| 17.6      | note             |          | 0:08       | Help opened at the top this time, good. But I reread: After the game clock reaches 1:00, offer one person a break. Wait five game seconds during that break. Still do not know what I wait for. Help is long, about 11 ideas. |
| 25.7      | tap Fast         |          |            | Trying Fast to see progress.                                                                                                                                                                                                  |
| 59.8      | note             |          | 2:04       | Reread: Dots mark open centres. The outline shows the candidate site and spacing. I do not know what open centres or candidate site mean. Second sentence I reread in total.                                                  |
| 62.8      | want_quit        | CONFUSED | 2:33       | Second sentence I had to reread (Dots mark open centres). I would stop here if I were not patient; I keep going.                                                                                                              |
| 70.7      | tap I'm confused |          |            | Chose I am confused about the Dots mark open centres sentence.                                                                                                                                                                |
| 86.8      | pulse 3          |          | 3:33       | Everyone got very tired fast; I rested all, now building is slow at 18 percent. I follow the numbers but worry about meals: 30 in store, 40 needed.                                                                           |
| 123.1     | pulse 3          |          | 5:30       | Waiting while people build; I watch the percent. Not much for me to decide now.                                                                                                                                               |
| 193.6     | tap I'm stopping |          |            | Choosing I am stopping because the day is finished.                                                                                                                                                                           |
| 193.6     | stop             | FINISHED | 10:00      | The day ended well. Eight different closing words this time, not the same sentence. The tally says 1 completed buildings, the number is right but grammar looks wrong. I would try a second day another evening, maybe.       |

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry            | reason   | game clock | words                                                                                                                                                                                                                                                                                                                                 |
| --------- | ---------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.3       | first_minute     |          | 0:00       | The sentence run-on from last time now has full stops: Tired people work slowly; a break helps. The map is big, labels Prepared boards, Meal crates, Ballast bags help me. Clear.                                                                                                                                                     |
| 42.0      | note             |          | 2:04       | Placement text again: Dots mark open centres. The outline shows the candidate site and spacing. I reread this; open centres and candidate site and spacing are not words I know. Also The game also checks selected people, busy residents, materials... is a long list. The picture helps more than the words: dashed house outline. |
| 46.0      | want_quit        | CONFUSED | 2:21       | Second reread on this device (the long checks sentence after Dots mark open centres). I keep going because the picture explained it.                                                                                                                                                                                                  |
| 50.6      | tap I'm confused |          |            | Chose I am confused about the open centres sentence.                                                                                                                                                                                                                                                                                  |
| 107.2     | pulse 4          |          | 5:56       | Meals first, then everyone building: I understood the order this time because the storm-meals sentence is on the main panel. Waiting for the percent to rise.                                                                                                                                                                         |
| 170.2     | tap I'm stopping |          |            | Choosing I am stopping because the day is finished.                                                                                                                                                                                                                                                                                   |
| 170.2     | stop             | FINISHED | 10:00      | Finished again on desktop. Run-on sentence fixed, grey Storehouse explained, help top visible, tally count correct (still says 1 completed buildings). Dots mark open centres still puzzles me. I would try a second day another evening.                                                                                             |


### Jonas Berg

**Would you return:** I would return voluntarily only if the next run were different or harder (a changed starting state, a storm that varies, or a goal beyond "finish before 10:00" with everyone under a roof). I have now won this scenario three times and would not replay it unchanged. I would not leave it running. I might come back another evening on those same conditions.

**Ranked asks:**
1. A harder or varied second run, so a solved routine does not just repeat. The routine is now fixed: split 4/3/1, rest before building, build, then roof.
2. A tally that teaches something: rests taken, time lost to very tired, meals spent, and how fast I built. At the end it reads only "8 people · 1 completed buildings".
3. On the phone, keep the name row and the "Now:" line in view while I use the work buttons.

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry                 | reason   | game clock | words                                                                                                                                                                                           |
| --------- | --------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.6       | tap New game          |          |            | Same title; New game.                                                                                                                                                                           |
| 5.9       | shot                  |          |            | Now the game states meals do not lower tiredness and shows 180/120 requirement. Answers two of my old questions.                                                                                |
| 16.8      | tap Meals             |          |            | Split: 4 boards, 3 ballast, 1 meals. Hypothesis: meals needed 40, have 30.                                                                                                                      |
| 16.8      | first_minute          |          | 0:15       | Rules are now written on screen: counts, meals vs rest, requirement 180/120. Dividing work is clear. Wondering what a rest costs.                                                               |
| 79.4      | tap Rest, then resume |          |            | Test: rest only the board crew while ballast crew keeps going.                                                                                                                                  |
| 79.6      | note                  |          | 1:15       | Boards nearly 180; resting four. Everyone tired at about 1:00 game time, faster than I expected.                                                                                                |
| 150.4     | pulse 4               |          | 2:30       | Rotating rest between crews; resting tired people only gets them to a little tired in 34s. Planning like a shift schedule, which I like.                                                        |
| 172.3     | tap Everyone rests    |          |            | Resting everyone before the build, since tired slows building.                                                                                                                                  |
| 287.5     | pulse 3               |          | 4:40       | Build 35% in half a minute; workers tired but fine. Rest before building did not clearly beat building now. Still engaged but solved-feeling.                                                   |
| 450.1     | tap Fast              |          |            | Nothing left to do; speeding to 10:00.                                                                                                                                                          |
| 517.6     | stop                  | FINISHED | 10:00      | Won at 10:00 with everyone under a roof. Closing lines now differ per person, rules are on screen. Tally still just 8 people, 1 completed building. Solved routine; would not replay unchanged. |

**Phone (360x690 touch phone)**

| elapsed s | entry            | reason   | game clock | words                                                                                                                                              |
| --------- | ---------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.7       | tap Boards       |          |            | Phone: name row clipped at Sevim again, but tapping by name works.                                                                                 |
| 8.2       | first_minute     |          | 0:15       | Same split as on desktop. Name row still cut at right; text lines now explain rules. Map is a strip.                                               |
| 128.2     | tap Ballast bags |          |            | Everyone to ballast, boards at 207 already.                                                                                                        |
| 153.5     | pulse 3          |          | 2:30       | Same routine as desktop; I know what to do. Hypothesis now: skip rests and build while tired.                                                      |
| 264.4     | note             |          | 4:20       | Built without rest: 13% per 30s vs 35% on desktop where I rested first. Hypothesis confirmed: rest before build pays.                              |
| 339.8     | pulse 3          |          | 5:36       | Rest mid-build restores pace: 19% to 49% in about a minute. Routine solved; waiting it out.                                                        |
| 423.9     | stop             | FINISHED | 10:00      | Won again at 10:00. Closing lines now vary by resident and mention breaks only for those I rested, which is a trace of my choices. Routine solved. |


### Aisha Rahman

**Would you return voluntarily?** "Yes, another evening, but only if the residents have something new to say or do on a later day; I have now heard every one of their single stories twice, and a storehouse that builds itself gives me nothing to come back for. I would not leave it running."

**Ranked asks**
1. Give each resident a second thing to say or do on a later day, or a visible consequence of the repair I agreed to. The Nora panel says "This chapter has no further conversation step", which hints that a later chapter exists, but I never saw one.
2. Keep "Invite conversation" and "Offer a small collaboration" visible at all times. They are still absent until I open "About this resident" for each newly selected person.
3. Keep the name row from being cut off on the phone (Sevim and Oskar scroll off the edge). Make the hub label stop sitting over the people on the phone map.

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry            | reason | game clock | words                                                                                                                                                                                                                                          |
| --------- | ---------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1       | tap New game     |        |            | Same title as before. New game.                                                                                                                                                                                                                |
| 12.8      | tap All          |        | 0:04       | Nora needs 1:00 mark, no shared location. Sending everyone to work meanwhile; boards.                                                                                                                                                          |
| 20.8      | first_minute     |        | 0:10       | Nora About now shows the 1:00 rule plainly and the invite buttons are visible next to it. Four on boards, four on ballast. People still say I am on my way.                                                                                    |
| 125.1     | note             |        | 1:01       | Nora told the handle story again, same as before. Explanations of the wait now say plainly the time and break requirements are met. Offering collaboration.                                                                                    |
| 149.4     | pulse 4          |        | 1:12       | Nerys and Nora both opened up quickly with the same stories as last time. The wait messages are exact and the buttons are visible now. It says this chapter has no further conversation step, which makes me wonder if a later chapter exists. |
| 203.0     | note             |        | 1:40       | For each new person, Invite conversation is again missing until I open About this resident. Same oddity as last visit, I tapped it and it said not on the page.                                                                                |
| 309.6     | want_quit        | BORED  | 2:32       | All eight told me their one story again, same as last visit; the storehouse is being built; nothing new for Nora after the collaboration. Satisfied, not annoyed.                                                                              |
| 316.8     | tap I'm stopping |        |            | Pressing I am stopping, not typing, not submitting.                                                                                                                                                                                            |
| 319.1     | stop             | BORED  | 2:35       | Stopping with the storehouse about 8% built. I met all eight again, same stories; nothing new to chase. Pressed I am stopping in Feedback, typed nothing, did not submit.                                                                      |

**Phone (360x690 touch phone)**

| elapsed s | entry        | reason | game clock | words                                                                                                                                                                                  |
| --------- | ------------ | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.3       | tap New game |        |            | Same game on my phone.                                                                                                                                                                 |
| 6.1       | first_minute |        | 0:05       | The phone map is taller than I remember, hub label still overlaps the people, name row still cuts off Sevim and Oskar. I sent Nora for boards and know I must wait for the 1:00 clock. |
| 191.3     | want_quit    | BORED  | 1:33       | Nora and Sevim opened up again with the same stories. The break held this time because I waited with the time passing in game. Nothing new; I would stop.                              |
| 195.1     | stop         | BORED  | 1:33       | Same evening on the phone: Nora and Sevim told the same stories; no reason to repeat the rest. Pressed I am stopping, typed nothing, did not submit.                                   |


### Diego Silva

**Would you return:** "I would come back one more evening to run it tighter and lose it on purpose, but only because the end lines now differ per resident and a loss is possible. I would not leave it running, and a run of three to six minutes is short enough that I would not come back the same night."

**Ranked asks**
1. Say which placement rule refused a tap. The phone still gave the generic line for an off-dots tap. Also tell me when I have enough boards or bags, so I stop overbuilding.
2. Give each resident's end line a different opening. All eight still start with "You gave me a break when I needed one."
3. Keep the phone map taller and keep the hub label clear of the people icons and the speed row.

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry                     | reason   | game clock | words                                                                                                                                                                                                                        |
| --------- | ------------------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.4       | tap New game              |          |            | Title, new game.                                                                                                                                                                                                             |
| 5.6       | tap Boards                |          |            | All then Boards.                                                                                                                                                                                                             |
| 14.0      | first_minute              |          | 0:03       | Big map, All then Boards worked instantly. Sidebar is a narrow cut-off panel but fine. Storehouse button now tells me why it is disabled (boards 80 of 180). Good.                                                           |
| 31.4      | tap Ballast bags          |          |            | Overshot boards at Fast (270). Everyone to bags.                                                                                                                                                                             |
| 68.6      | tap Everyone rests        |          |            | Everyone very tired; resting.                                                                                                                                                                                                |
| 91.1      | pulse 4                   |          | 4:45       | Fast is quick, I overshot boards to 285 and bags to 152 - nothing told me I had enough, so I wasted effort. Tired/rest status is clear.                                                                                      |
| 94.7      | tap                       |          |            | Tapping a dotted spot right of the hub.                                                                                                                                                                                      |
| 97.7      | pulse 4                   |          | 5:34       | Dots plus outline, tap worked first time. Placement clear on desktop.                                                                                                                                                        |
| 158.7     | tap Everyone under a roof |          |            | Out of time, 69% storehouse. Sending everyone under the hub roof.                                                                                                                                                            |
| 177.1     | stop                      | FINISHED | 10:00      | Lost this time at 10:00 with storehouse 71%, supplies soaked. Each resident now has a different line, though they all open with the same sentence. Good. Now I want to rerun and do it tighter: I overbuilt boards and bags. |

**Phone (360x690 touch phone)**

| elapsed s | entry        | reason   | game clock | words                                                                                                                                                                                                                |
| --------- | ------------ | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.8       | first_minute |          | 0:00       | Phone map is taller than the thin strip before, but the speed row still sits on it and people cover the hub label. Usable. Tapping All, Boards.                                                                      |
| 39.6      | tap          |          |            | Deliberately tapping bare ground off the dots to see the refusal.                                                                                                                                                    |
| 41.7      | note         |          | 2:22       | Off-dots tap refused with the same generic line, still does not say off the dots. Retrying on dots.                                                                                                                  |
| 48.0      | pulse 3      |          | 2:45       | Faster and tighter than before; I like keeping meals vs build as a split. Phone map is now readable with hub and storehouse.                                                                                         |
| 75.9      | tap          |          |            | Tapping the storehouse site to add builders.                                                                                                                                                                         |
| 159.6     | stop         | FINISHED | 10:00      | Won at 10:00 in about 2.5 real minutes at Fast, much tighter. End lines now differ per resident but all start with the same sentence. Phone map readable now. Would run once more on the desktop to lose on purpose. |


### Mei Tan

**Would I return voluntarily?** Yes, but only for a different day. I would come back another evening if the game offered something new, such as the longer day, because I have now seen the storm and the ending twice. I would not leave it running. I would not replay this same day.

**Ranked asks:**
1. Make each resident's whole ending line their own. The first sentence is now individual, but the last two sentences are the same for everyone.
2. Put the resident's conversation options and the "wait until 1:00" text where I can see them, not inside the folded "About this resident" section and a small scroll window.
3. Make selection stop being sticky, or show clearly that a selection stays after an order. On the first order I sent three people to meals by mistake.

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry                                         | reason   | game clock | words                                                                                                                                                                                              |
| --------- | --------------------------------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.6       | tap New game                                  |          |            | Same plain title page, new start options listed                                                                                                                                                    |
| 10.7      | tap Nora                                      |          | 0:05       | Nora to boards first                                                                                                                                                                               |
| 14.3      | tap Meals                                     |          |            | Nerys to meals                                                                                                                                                                                     |
| 14.3      | first_minute                                  |          | 0:30       | Same screen as before. Steady is already on. Text is huge and the right panel is cut off at the bottom of the window. Nora boards, Sam bags, Nerys meals.                                          |
| 18.6      | tap Clear                                     |          |            | Selection stays after an order. Nora, Sam and Nerys all went to meals. I must Clear between orders.                                                                                                |
| 42.2      | wait                                          |          |            | waiting for work to progress                                                                                                                                                                       |
| 46.9      | tap Nerys                                     |          |            | Looking at what Nerys can do next                                                                                                                                                                  |
| 66.5      | TOOL tap                                      |          |            | Looking for conversation options like last time                                                                                                                                                    |
| 68.7      | tap                                           |          |            | Opening the about section                                                                                                                                                                          |
| 71.9      | tap Rest, then resume                         |          |            | Nerys says she is tired, so a rest first                                                                                                                                                           |
| 84.2      | note                                          |          | 1:20       | The conversation options are hidden inside About this resident; I only found them by opening it. Selecting more than one person and ordering moves them all, so I must press Clear between orders. |
| 86.6      | tap Offer a small collaboration               |          |            | Offering the collaboration                                                                                                                                                                         |
| 92.8      | pulse 4                                       |          | 1:40       | Conversation and offer flowed from the panel text. Resources climbing. Still reading through a cut-off right panel.                                                                                |
| 154.6     | tap Boards                                    |          |            | Bags are over 120, moving four people to boards                                                                                                                                                    |
| 176.7     | pulse 4                                       |          | 3:00       | Boards nearly 180. Rhythm is clear. Panel still cut off but the About section finds everything. Meals are slowly rising on their own.                                                              |
| 179.0     | tap Storehouse · 180 boards, 120 ballast bags |          |            | Everyone to the storehouse                                                                                                                                                                         |
| 181.0     | tap                                           |          |            | Placing the storehouse on open ground south east of the hub                                                                                                                                        |
| 183.8     | tap Everyone rests                            |          |            | Everyone is very tired and slow, so a break for all of them                                                                                                                                        |
| 208.9     | pulse 4                                       |          | 3:45       | Storehouse placed, everyone rested. Same rhythm as my last visit; I know the screen now.                                                                                                           |
| 337.1     | tap Everyone rests                            |          |            | All very tired again, resting everyone to speed the build                                                                                                                                          |
| 337.2     | pulse 4                                       |          | 5:35       | Storehouse 54 percent. Resting when very tired helps; the tired state is clear. A little impatient waiting for the day to finish.                                                                  |
| 492.2     | note                                          |          | 8:07       | Ready state text: storehouse ready, meals enough, everyone under a roof. Waiting for the storm.                                                                                                    |
| 616.3     | want_quit                                     | FINISHED | 10:00      | The storm came and the supplies stayed dry. Each resident now has a first sentence of their own, but the last two sentences are shared. Better than before, still partly the same.                 |
| 616.3     | stop                                          | FINISHED | 10:00      | Stopping at the ending. I pressed I am stopping and typed and submitted nothing.                                                                                                                   |

**Phone (360x690 touch phone)**

| elapsed s | entry                           | reason   | game clock | words                                                                                                                                                                                |
| --------- | ------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6.0       | first_minute                    |          | 0:02       | Phone: the map is now a readable block with the places and hub visible above the text. Order buttons are below the fold and I have to scroll. Notice bar covers a bit of the bottom. |
| 13.0      | tap Rest, then resume           |          |            | Rest Nerys first so she can talk                                                                                                                                                     |
| 34.6      | pulse 3                         |          | 1:30       | On the phone I can do everything but the resident panel is a small window and I scroll a lot. The map above is now readable.                                                         |
| 73.6      | tap Rest, then resume           |          |            | My early break ended before 1:00; offering another, now that the clock is past it                                                                                                    |
| 82.2      | tap Offer a small collaboration |          |            | Offering the collaboration on the phone                                                                                                                                              |
| 86.5      | note                            |          | 1:25       | Rested Nerys too early again because the wait text sits low in a small window; second try worked. Collaboration done, new reply text.                                                |
| 119.9     | tap Boards                      |          |            | Bags are past 120, moving bag people to boards                                                                                                                                       |
| 143.1     | tap                             |          |            | Placing on open ground south-east of the hub                                                                                                                                         |
| 143.3     | tap Everyone rests              |          |            | Everyone rests before building                                                                                                                                                       |
| 143.3     | pulse 3                         |          | 2:30       | Storehouse placed on phone, everyone resting. I know the rhythm; mostly waiting now.                                                                                                 |
| 266.7     | tap Everyone rests              |          |            | Very tired again, rest everyone                                                                                                                                                      |
| 470.6     | note                            |          | 7:47       | Ready text on phone too. Waiting for the storm to see the ending on the phone.                                                                                                       |
| 616.7     | want_quit                       | FINISHED | 10:00      | Phone ending reached, same ending as the laptop. Done.                                                                                                                               |
| 616.7     | stop                            | FINISHED | 10:00      | Stopping on the phone at the ending. I pressed I am stopping and typed and submitted nothing.                                                                                        |


### Samir Haddad

**Would you return voluntarily?** I would come back another evening on desktop, because the endings now carry what each resident told me. I would not leave it running, and I would only come back for new content, such as new confessions or collaboration shapes, since I have now heard all eight.

**Ranked asks:**
1. Add more variety and more consequence. The conversations and endings are the same on every run (seeded), and the opening sentence of each closing line is still identical across the eight. Make the first sentence reflect what I actually did with each person.
2. Make the choices more tense. Both runs were won without risk. The Eat and drink and hub-helper decisions are now clear but never pressing, because meals were never short.
3. On the phone, give the thin map outside placement the same visibility the placement map now has. I did not test this on a stricter screen.

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry                   | reason   | game clock | words                                                                                                                                                                                                                                                             |
| --------- | ----------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.7       | tap New game            |          |            | Retest. New game.                                                                                                                                                                                                                                                 |
| 6.6       | first_minute            |          |            | Start screen now says why Storehouse is locked (boards 80 of 180, ballast 0 of 120) and warns Eating uses meals vs storm need 40. Both my earlier asks answered on screen. Assigning work now.                                                                    |
| 66.4      | tap Invite conversation |          |            | Trying to talk to Dai                                                                                                                                                                                                                                             |
| 72.0      | note                    |          |            | Dai admitted a list of checks he kept in his head and liked being needed. Requirement text is clear now, and shows the Storehouse unlock numbers.                                                                                                                 |
| 113.2     | pulse 4                 |          | unknown    | All eight talked. Confessions and collaborations are in their own voice; I want to see if endings echo them.                                                                                                                                                      |
| 214.0     | note                    |          |            | Storehouse unlocked at the moment the stocks hit 180/120, and the button label and not-ready line told me exactly what was missing. Placement easy on desktop.                                                                                                    |
| 249.5     | tap Everyone rests      |          |            | Everyone is very tired already; resting everyone.                                                                                                                                                                                                                 |
| 316.1     | pulse 3                 |          | 5:10       | Building went fast once they were all on it; the very-tired state is now visible and I rested everyone once. Waiting again, my interest is in the ending lines.                                                                                                   |
| 614.4     | want_quit               | FINISHED |            | Ending: each resident now echoes what they admitted or did with me (easier grip back, game note says only what I tried, drafted note to the pupil unsent, accurate caption). Two shared sentences remain on top but the middle is personal. That was my main ask. |
| 616.7     | stop                    | FINISHED |            | I am stopping. Won with dry supplies, and the closing lines now carry what each person told me. I chose I am stopping in Feedback and typed nothing, no submit.                                                                                                   |

**Phone (360x690 touch phone)**

| elapsed s | entry              | reason   | game clock | words                                                                                                                                                                          |
| --------- | ------------------ | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.6       | tap New game       |          |            | Phone, same evening. New game.                                                                                                                                                 |
| 5.2       | first_minute       |          |            | Phone: map is bigger than last time, I can see the whole field now with the hub. Names row scrolls sideways (Sevim cut off). Assigning meals, ballast, boards like on desktop. |
| 62.4      | note               |          |            | My slip again: invited before 1:00; the page told me to wait N game seconds and it counted down correctly, so the message was clear.                                           |
| 90.6      | pulse 4            |          | 1:30       | All eight talked on phone; same lines as desktop, so the conversations are fixed content. Now stocking ballast and boards.                                                     |
| 185.1     | note               |          |            | Phone placement worked on the first tap again; the map is bigger and the unlock reason for Storehouse is written on screen.                                                    |
| 278.2     | tap Everyone rests |          |            | Very tired again; resting everyone like on desktop.                                                                                                                            |
| 370.7     | pulse 3            |          | 6:08       | Building at 71 percent, on track. Waiting again; the only choice that matters is resting.                                                                                      |
| 639.6     | want_quit          | FINISHED |            | Won on phone. Closing lines carry each person admission plus a tiredness phrase that varies. Opening sentence is still the same for everybody.                                 |
| 640.0     | stop               | FINISHED |            | I am stopping. Won with dry supplies. Chose I am stopping in Feedback, typed nothing, no submit.                                                                               |


### Tessa Williams

**Would I return voluntarily?** Yes, but only on the personal-replies day, and only if there were more residents with stories to answer. I would not come back for the plain ten-minute game. I would not leave either one running. I'd come back another evening only if I knew new stories were waiting.

**Ranked asks**
1. Make the reply buttons easy to reach on desktop. The middle strip of the right panel is tiny, and I scrolled for minutes to find "Say this to Nora".
2. Give Dai a reply on the plain New game too. His chapter still ends with "no further conversation step".
3. Give me more to do with the place after the cabins. Invite helper costs 35 meals and I had 30.

**Phone (360x690 touch phone)**

| elapsed s | entry                         | reason | game clock | words                                                                                                                                                                                                       |
| --------- | ----------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.8       | tap New game                  |        |            | Title again, plain New game                                                                                                                                                                                 |
| 7.0       | tap Nora                      |        |            | Same start as before. Picking Nora, then the cabin.                                                                                                                                                         |
| 11.3      | tap                           |        |            | Dots are denser and there is an outline now, nice. Trying open ground by the left.                                                                                                                          |
| 13.8      | tap Clear                     |        |            | Cabin on first try. Clearing so Nora keeps building.                                                                                                                                                        |
| 24.2      | tap Fast                      |        |            | Trying Fast to see how it feels                                                                                                                                                                             |
| 44.3      | first_minute                  |        | 0:50       | Cabin went down on the first tap this time. Dots are dense and there is an outline. Nora set off for the cabin, Sam for boards. Still a short strip of map on the phone. Not much new yet beyond placement. |
| 48.9      | tap                           |        |            | The About section folded itself shut again, like last time.                                                                                                                                                 |
| 63.3      | note                          |        | 2:30       | Dai told me he kept using a temporary fix after the sensor problem was fixed because he liked being needed. Same confession as last time I think. Wondering whether I can answer him this time.             |
| 67.4      | note                          |        | 2:40       | Same inspection card and then: no further conversation step. Same wall as before. I cannot answer Dai on this start.                                                                                        |
| 67.6      | tap Prepare cabin · 40 boards |        |            | Trying a second cabin for mischief                                                                                                                                                                          |
| 73.1      | tap                           |        |            | Tapping the hub to see what it does                                                                                                                                                                         |
| 77.0      | pulse 3                       |        | 2:20       | A second cabin worked and tapping the hub shows an invite helper for 35 meals which I cannot afford. That is new. But Dai is still the same dead end.                                                       |
| 77.0      | want_quit                     | TASTE  | 2:20       | I have placed two cabins, heard Dai, hit no further conversation step again. Nothing new to try that I can see on a plain start. I would leave.                                                             |
| 81.7      | stop                          | TASTE  | 2:25       | I am stopping on the phone. Cabins went down first try, a second cabin worked, but Dai is the same wall and I could not do anything else with the place. I would not come back for this start.              |

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry                      | reason | game clock | words                                                                                                                                                                                                                                                                                       |
| --------- | -------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.6       | tap                        |        |            | Taking the personal replies day, as that is what I want                                                                                                                                                                                                                                     |
| 5.4       | tap Nora                   |        |            | Nora first, same as before                                                                                                                                                                                                                                                                  |
| 11.6      | tap Invite a private story |        |            | Inviting Nora to tell me something                                                                                                                                                                                                                                                          |
| 20.1      | first_minute               |        | 08:07      | Cabin down on first tap, red outline when blocked. Day is 08:00 to 20:00 with Paper 4. Invite a private story says wait one minute of play at Steady. The right panel is cut off a bit again with buttons peeking under the text.                                                           |
| 63.4      | scroll                     |        |            | The reply buttons are offscreen above, scrolling the panel up                                                                                                                                                                                                                               |
| 91.2      | tap                        |        |            | Finally a reply button in view, I can answer Nora without any commander walk.                                                                                                                                                                                                               |
| 105.5     | note                       |        | 12:10      | I answered Nora and she put the grip back on the drawing and said she still has to ask the person who would use it. No commander, no walk, panel stayed. The reply itself felt good and specific. But finding the button took a lot of scrolling in a tiny middle strip of the right panel. |
| 141.3     | tap                        |        |            | Choosing the second reply for Sevim, leaving room for him to answer.                                                                                                                                                                                                                        |
| 159.2     | pulse 4                    |        | 14:30      | The two different replies got two different answers from Sevim (she added a line and said she cannot fill in his answer). That is what I asked for. The reply buttons are a pain to scroll to though.                                                                                       |
| 159.2     | want_quit                  | TASTE  | 14:30      | I have had both replies I wanted. What is left is hauling boards for a long day. I might leave here, not frustrated.                                                                                                                                                                        |
| 161.8     | stop                       | TASTE  | 14:35      | I am stopping on the laptop. I got to answer both Nora and Sevim and that worked. I would come back for new residents with new stories, not for another day of hauling.                                                                                                                     |


### Pavel Novak

Yes, I would return voluntarily, but not tonight and I would not leave it running. I would come back another evening on the desktop to try a different split of the work, since I won both runs and the day is now short. My own history says "maybe, if I could learn how to keep eight people from all getting tired at once", and this visit gave me the means to do that.

**Ranked asks**
1. Make the whole-group orders (Everyone rests, Everyone under a roof) keep or restore each person's work. Under a roof, people went idle with no task and I had to order work again. The page said "Work will resume after the break" when it did not.
2. Fix the phone name row. Sevim and Oskar are still cut off at the right edge, and the action buttons still sit partly under the footer strip.
3. Say why tiredness comes back so fast, for example that people are tired again because of the work done outside.

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry                                         | reason   | game clock | words                                                                                                                                                                                                                                                                             |
| --------- | --------------------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.4       | tap New game                                  |          |            | Back again. New game.                                                                                                                                                                                                                                                             |
| 13.0      | tap Ballast bags                              |          | 0:10       | Nora boards, Sam ballast.                                                                                                                                                                                                                                                         |
| 37.1      | tap Ballast bags                              |          | 0:30       | Two on boards, four on ballast.                                                                                                                                                                                                                                                   |
| 46.9      | first_minute                                  |          | 0:34       | Same job. Two on boards, four on ballast. New: Everyone rests and Everyone under a roof buttons exist, which is what I asked for. Resident line still tells rested and roof.                                                                                                      |
| 109.1     | pulse 4                                       |          | 1:45       | Work goes fast; people start to be a little tired by 1:14. Waiting to try Everyone rests.                                                                                                                                                                                         |
| 111.3     | tap Everyone under a roof                     |          |            | Trying the new whole-group order.                                                                                                                                                                                                                                                 |
| 120.8     | tap Everyone rests                            |          |            | Everyone rests now.                                                                                                                                                                                                                                                               |
| 165.7     | note                                          |          | 2:40       | Everyone under a roof and Everyone rests both work on all eight at once. Break had 35 s, tiredness dropped one step. But after rest they just wait; the work order was lost, I must give it again. Text says Work will resume after the break, yet they wait. Mild contradiction. |
| 182.8     | tap Storehouse · 180 boards, 120 ballast bags |          |            | Boards and ballast are enough. Building.                                                                                                                                                                                                                                          |
| 205.1     | tap                                           |          |            | Dots mark open ground; I tap the outlined site.                                                                                                                                                                                                                                   |
| 218.5     | pulse 4                                       |          | 3:35       | Built the storehouse order; now it assembles slowly because everyone is tired. I will try Everyone rests during assembly to see if work resumes by itself.                                                                                                                        |
| 477.3     | tap Meals                                     |          |            | Storehouse is up. Need 10 more meals; sending everyone to the meal crates.                                                                                                                                                                                                        |
| 539.3     | tap Everyone under a roof                     |          |            | Meals enough. Everyone indoors now.                                                                                                                                                                                                                                               |
| 614.1     | note                                          |          | 10:00      | The storm came at 10:00. Storehouse finished, supplies dry, meals enough, everyone under a roof. First time I finished. The residents each say what the day was like, with their own lines.                                                                                       |
| 618.2     | pulse 4                                       |          | 10:00      | Won with everyone indoors; whole-group orders made the mass tiredness manageable. Still everyone very tired at the end.                                                                                                                                                           |
| 618.2     | stop                                          | FINISHED | 10:00      | The game ended: storehouse finished at 7:37, meals enough, everyone under a roof at 10:00. I read the residents closing lines. I did not open Feedback because I was neither confused nor leaving unfinished.                                                                     |

**Phone (360x690 touch phone)**

| elapsed s | entry              | reason   | game clock | words                                                                                                                                                                              |
| --------- | ------------------ | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.2       | tap New game       |          |            | Second device. New game.                                                                                                                                                           |
| 7.6       | tap Ballast bags   |          |            | Nora boards, others ballast. Name row still runs past the right edge, S is cut.                                                                                                    |
| 10.4      | first_minute       |          | 0:45       | Phone. Map still small, name row still runs off the right edge (it scrolls sideways by itself when I tap). Action buttons sit partly under the footer strip. But the buttons work. |
| 136.8     | tap Everyone rests |          |            | Everyone very tired already at 2:11. Resting all.                                                                                                                                  |
| 139.5     | pulse 4            |          | 2:14       | Building. The whole-group rest button saves the fiddling I disliked. Phone panel still a short strip.                                                                              |
| 615.1     | stop               | FINISHED | 10:00      | Won again on the phone at 10:00: storehouse built, meals enough, everyone under a roof. Phone worked well enough this time though the name row still runs off the edge.            |


### Leila Mansour

I would return voluntarily, on one evening at least: this time Nora answered a reply I chose, which is what I asked for, so I would come back for more of that. I would not leave it running, because it needs me to act. I would also want the standard ten-minute day to offer a reply.

**Ranked asks**
1. Put a reply into the standard ten-minute day. Right now a reply exists only in a separate mode, and the pause menu has no way back to the title page, so I reached it only by finishing a day first.
2. Make the reply day's controls readable. Both "Say this to Nora" buttons have the same name. The panel is a tiny scroll window at 1280x800. The "one minute at Steady" gate is counted only at Steady, but the day starts at Fast.
3. Warn me before "Everyone under a roof" halts assembly. I lost a day to that.

**Phone (360x690 touch phone)**

| elapsed s | entry                           | reason   | game clock | words                                                                                                                                                                                                                 |
| --------- | ------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.0       | tap New game                    |          |            | New game, as before. Looking for whether the reply day is easier to find.                                                                                                                                             |
| 5.8       | tap Boards                      |          |            | Everyone to boards. Meals text up front now says eating does not lower tiredness - answers my old complaint.                                                                                                          |
| 9.8       | first_minute                    |          | 0:03       | Goal 180 boards, 120 bags by 10:00 again. Meal rule and tiredness stated up front now. Dai and Nerys absent text. Waiting to see pace.                                                                                |
| 37.7      | tap Ballast bags                |          |            | Boards nearly done in half a minute; same early rush as before. Sending all to bags.                                                                                                                                  |
| 82.6      | tap Rest, then resume           |          |            | Nora needs a break first, the panel says so. Resting her, then inviting conversation.                                                                                                                                 |
| 93.1      | tap Offer a small collaboration |          |            | Same handle confession as before, printed fewer times, one tap this time. Still no way to answer her. Offering the collaboration.                                                                                     |
| 96.1      | pulse 3                         |          | 1:40       | Collaboration result is shown, same as last visit; reply still absent in this day. Rushed resources early but tiredness is now a real thing. Meal cost is stated before I tap.                                        |
| 129.7     | tap                             |          |            | Placing storehouse on the dotted open ground near the outline.                                                                                                                                                        |
| 147.7     | tap Everyone rests              |          |            | Everyone is very tired and works very slowly, storehouse 15% at 4:46. Resting everyone.                                                                                                                               |
| 172.0     | tap Meals                       |          |            | Storm day needs 40 meals, I have 30. Three go for meals. I know this one because the panel said it up front.                                                                                                          |
| 204.1     | pulse 4                         |          | 8:36       | Now I am juggling build, meals and tiredness against 10:00; that is real pressure. Wanted: someone to say no to me.                                                                                                   |
| 235.9     | shot                            |          |            | Ended.                                                                                                                                                                                                                |
| 238.4     | want_quit                       | FINISHED |            | Won at 10:00 with the storehouse, but three caught in the rain and meals only half the storm day. The closing lines are now each their own, mixing break, personal line and rain. That is what I asked for last time. |
| 241.0     | stop                            | FINISHED |            | Run ended with a win. Selected I am stopping in Feedback; typed nothing, did not submit.                                                                                                                              |

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry                              | reason     | game clock | words                                                                                                                                                                                                                                              |
| --------- | ---------------------------------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.6       | tap New game                       |            |            | Desktop, second visit. New game again, then I will look for the reply day I asked for.                                                                                                                                                             |
| 3.3       | first_minute                       |            |            | Desktop start explains storm, meals, roof and cabin up front. I came for the reply day, so I will go there straight away.                                                                                                                          |
| 7.9       | tap Replace saved game             |            |            | I want the title page to pick the replies day; the menu offers only New game, so replacing.                                                                                                                                                        |
| 11.4      | note                               |            |            | No way back to the title page from the pause menu; New game restarts the standard day. So to reach the replies day I must finish this one. Playing it fast.                                                                                        |
| 166.8     | want_quit                          | FRUSTRATED |            | I lost: I ordered everyone under a roof at 6:49 and that stopped the building at 56%; my own mistake, but nothing told me roof-ordering halts assembly. Closing lines are individual and read well. Now going for the replies day.                 |
| 169.7     | tap Start a fresh day with replies |            |            | The replies day description now says I answer the resident where they are. No commander mentioned. Trying.                                                                                                                                         |
| 174.4     | tap Nora                           |            |            | Selecting Nora as the panel says.                                                                                                                                                                                                                  |
| 180.6     | tap Invite a private story         |            |            | Inviting Nora to share a private story, the thing I came for.                                                                                                                                                                                      |
| 190.3     | note                               |            |            | Gate says after one minute of play at Steady, I may invite a private story. Fast is the default here, so the minute counts at Steady only. Switching to Steady and waiting. A bit odd that the speed matters.                                      |
| 270.5     | note                               |            |            | Nora told me the handle story. Two replies appear: put the grip back and mark the drawing unfinished, or write down what I still need to ask. Text says I can answer where Nora is now. No commander this time. Checking whether the buttons work. |
| 273.1     | TOOL tap                           |            |            | Both buttons carry the same name, so the driver cannot tell them apart.                                                                                                                                                                            |
| 290.2     | tap                                |            |            | Both replies are the same-name buttons; I tap the first by position: put the grip back and mark the drawing unfinished.                                                                                                                            |
| 339.5     | pulse 4                            |            | 10:19      | The reply I wanted works: I said the line, Nora answered in her own words and the paper record shows unfinished. No commander. Slightly hard: two same-named buttons and the panel is a tiny scroll window.                                        |
| 339.6     | want_quit                          | FINISHED   |            | I got what I came for. Not leaving from confusion; the rest of this heavy day I would not play tonight.                                                                                                                                            |
| 341.9     | stop                               | FINISHED   |            | Stopped after Nora answered my reply. Selected I am stopping in Feedback; typed nothing, did not submit.                                                                                                                                           |


### Alina Popescu

**Would you return voluntarily?** Yes. I would come back on a computer one more evening to talk to the residents I have not met yet: Nera, Dai, Burak, Dilek, Sam and Oskar. Sevim's conversation is what made me want that. I would not play it on my phone for the map, and I would not leave it running. The game only moves while I give orders or watch it.

**Ranked asks:**
1. Fix "Everyone rests" so it rests everyone, or label it truthfully. It seemed to rest only one person on both devices, and I think it also makes a resident's break look half-applied.
2. Show how many people are tired, and warn before the build slows. On the desktop the storehouse was only 25% done at 6:19 and 72% at 8:37. It finished near 9:30 only because I used "Rest, then resume" on all eight people.
3. On the phone, keep the storehouse tappable while adding builders. It was half under the caption again.

**Phone (360x690 touch phone)**

| elapsed s | entry                     | reason   | game clock | words                                                                                                                                                                                                                     |
| --------- | ------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.7       | tap New game              |          |            | Title page plain. New game.                                                                                                                                                                                               |
| 9.1       | tap All                   |          |            | Map still thin strip? Looking. Notice new line: meals do not lower tiredness - answers my last ask.                                                                                                                       |
| 13.9      | tap Ballast bags          |          |            | Three on bags, rest stay on boards.                                                                                                                                                                                       |
| 13.9      | first_minute              |          | 0:20       | About a minute in. Map is taller than before, not a thin strip, and there is a new line saying meals do not lower tiredness, which answers my old question. Work is flowing.                                              |
| 49.2      | tap Fast                  |          |            | Trying Fast so ten game minutes do not take ten real minutes.                                                                                                                                                             |
| 72.7      | tap Rest, then resume     |          |            | Three are very tired; resting them, as the text says rest helps.                                                                                                                                                          |
| 73.8      | tap Ballast bags          |          |            | Boards are already past 180, so the rest go to bags.                                                                                                                                                                      |
| 75.7      | tap Everyone rests        |          |            | Everyone is very tired, resting all.                                                                                                                                                                                      |
| 95.5      | tap                       |          |            | Placing storehouse near the outline.                                                                                                                                                                                      |
| 98.3      | pulse 4                   |          | 3:49       | Storehouse placed on first tap again. Everyone very tired; the screen now says rest is what helps, which I wanted.                                                                                                        |
| 98.6      | tap Rest, then resume     |          |            | Resting everyone before they stall.                                                                                                                                                                                       |
| 116.5     | tap                       |          |            | Storehouse is half under the caption; tapping its roof.                                                                                                                                                                   |
| 148.8     | pulse 3                   |          | 7:00       | All eight are on the storehouse but very tired and slow; rest only helps briefly. Waiting is slow-ish.                                                                                                                    |
| 184.8     | tap Everyone under a roof |          |            | Sending everyone under a roof.                                                                                                                                                                                            |
| 205.8     | tap I'm stopping          |          |            | Tapping I am stopping; not submitting.                                                                                                                                                                                    |
| 205.8     | note                      |          | 10:00      | Ending: now each resident has a different line (handle, joints, dam, river, meals, counting, record, photo), which I asked for. But the store holds only 2 meals and people are hungry; I did not manage meals this time. |
| 205.8     | stop                      | FINISHED |            | Storm came, storehouse done, everyone under a roof, but almost no meals. Stopping the phone session. The map is bigger than the thin strip but still got covered by captions when adding builders.                        |

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry                           | reason   | game clock | words                                                                                                                                                 |
| --------- | ------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.6       | tap New game                    |          |            | New game again on the computer.                                                                                                                       |
| 4.9       | tap Boards                      |          |            | Three on boards. Intro now says why: 5 meals per person, with a period. Typo gone.                                                                    |
| 6.3       | tap Meals                       |          |            | Two on meals because the store needs 40.                                                                                                              |
| 8.3       | first_minute                    |          | 0:15       | Desktop: big labelled map again. The intro typo is gone and the help now says a break helps. Work assigned: boards, bags, two on meals.               |
| 26.3      | tap Rest, then resume           |          |            | Meals are past 40 now. Sevim said she needs a break; I want to hear her, so resting her first.                                                        |
| 32.5      | tap Invite conversation         |          |            | Trying a conversation with Sevim, someone new.                                                                                                        |
| 35.2      | tap Offer a small collaboration |          |            | Sevim told me about the pupil she misjudged. Strong. Offering collaboration.                                                                          |
| 35.2      | pulse 4                         |          | 2:00       | Conversation with a new resident (Sevim) worked and gave me a real secret about a pupil. This is why I come back.                                     |
| 68.9      | tap                             |          |            | Placing the storehouse in open ground south-west of the hub.                                                                                          |
| 71.8      | tap Ballast bags                |          |            | Everyone to bags; boards are enough, bags at 114 of 120 and slowing down.                                                                             |
| 81.6      | tap                             |          |            | Placing south-west of the hub, near the outline.                                                                                                      |
| 81.6      | pulse 4                         |          | 4:50       | Placement preview clear again; placed on first tap with all eight assigned.                                                                           |
| 104.2     | tap Everyone rests              |          |            | 25 percent at 6:19 - people are slow. Everyone rests briefly.                                                                                         |
| 126.2     | tap Rest, then resume           |          |            | Everyone is very tired; Everyone rests seemed to rest only Sevim last time, so using the selected rest.                                               |
| 166.0     | tap I'm stopping                |          |            | Tapping I am stopping; not submitting.                                                                                                                |
| 166.0     | note                            |          | 10:00      | Ending: Sevim line mentions the note to the pupil I heard about. Others share the break line plus one personal sentence. Good, better than last time. |
| 166.0     | stop                            | FINISHED |            | Storm came, supplies dry, enough meals, everyone indoors; Sevim conversation was the best part. Stopping; not pressing Submit.                        |


### Julio Romero

**Would I return voluntarily?** Yes, to the ten-minute day on the phone, for one more evening, because the storehouse now works and I want to finish it. I would not return to the long day unprompted unless the repeat disputes get a readable cause. I would not leave either one running by itself.

**Ranked asks:**
1. Explain why a new trolley dispute starts right after each yield, and show whether the long day's goal (180 boards, 120 ballast bags by 20:00) can still be reached at the current pace.
2. On the long day, keep the boards crew working after a yield. Boards sat at 101 of 180 for hours while only ballast moved.
3. On the phone, stop the name chips running off the right edge (Sevim and Oskar are cut off). Keep the map large during normal play.

**Desktop (1280x800 keyboard and mouse)**

| elapsed s | entry                                  | reason   | game clock | words                                                                                                                                                                                                                                                                                                               |
| --------- | -------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.8       | tap                                    |          |            | Last time the long day stalled; I try it again to see if causes are shown.                                                                                                                                                                                                                                          |
| 25.1      | first_minute                           |          | 08:11      | Long day again, 80 boards, no ballast. Sent four on boards, four on ballast. Panel now says Everyone now with who is doing what, which helps. Will watch what stalls.                                                                                                                                               |
| 49.9      | tap Sam                                |          |            | The text says Sam and Nora are the pair, so I ask one of them, Sam, to yield.                                                                                                                                                                                                                                       |
| 93.0      | tap Nora                               |          |            | Nora is in every dispute so far (Sam, now Dai). I ask Nora to yield, since she is the common party.                                                                                                                                                                                                                 |
| 118.3     | tap Bring carried materials to the hub |          |            | The game told me Nora is still carrying; I bring her materials to the hub first.                                                                                                                                                                                                                                    |
| 169.2     | pulse 3                                |          | 10:05      | 10:05. Nora yielded and route opened. The panel now names the pair and says Nora is still carrying - clearer than before. Ballast still 0 though.                                                                                                                                                                   |
| 197.5     | tap Dai                                |          |            | The panel says Nerys and Dai can talk. I try letting them talk, to see if it stops the repeat disputes.                                                                                                                                                                                                             |
| 245.1     | tap Offer to yield the trolley route   |          |            | Talking did not open the route. Dai is the repeat name, I ask Dai to yield.                                                                                                                                                                                                                                         |
| 309.5     | want_quit                              | CONFUSED | 11:55      | 11:55. Ballast 7 of 120, boards 101 of 180, and a fresh dispute (Burak and Dilek) every time I fix one. Now I can name the pair and the fix works, but I still do not see why they keep colliding, or whether 120 ballast bags is reachable in the 8 hours left. I would leave if the next fix repeats the pattern. |
| 337.9     | tap Fast                               |          |            | Using the game own Fast speed so the yield has time to complete.                                                                                                                                                                                                                                                    |
| 366.7     | tap Dilek                              |          |            | Dilek is in the last two disputes; I ask her to yield.                                                                                                                                                                                                                                                              |
| 400.2     | tap I'm stopping                       |          |            | Choosing I am stopping; I will not type a note or submit.                                                                                                                                                                                                                                                           |
| 400.3     | stop                                   | CONFUSED | 15:24      | About 9 real minutes, 15:24 game. Ballast 21 of 120, boards stuck at 101 of 180, and a new dispute after every yield. Now I can see the pair and the fix works, which is better, but I still see no cause for the repeats and no way the goal is reachable at this rate. I stop.                                    |

**Phone (360x690 touch phone)**

| elapsed s | entry                                         | reason   | game clock | words                                                                                                                                                                                                                                                |
| --------- | --------------------------------------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.4       | tap New game                                  |          |            | Phone, second device. I take the ordinary New game so I can check the storehouse on the phone.                                                                                                                                                       |
| 9.0       | first_minute                                  |          | 0:20       | Phone. Meals 30 and the text now says the storm day needs 40, that meals do not lower tiredness but rest does. Map is bigger than last time and shows crates. Name chips still run off the right edge. Sent four on boards, four on ballast.         |
| 121.6     | tap Storehouse · 180 boards, 120 ballast bags |          |            | Button is enabled now and the text says tap open ground. I do that.                                                                                                                                                                                  |
| 125.3     | tap                                           |          |            | Tapping the dotted outline to the right of the hub.                                                                                                                                                                                                  |
| 129.7     | pulse 4                                       |          | 2:04       | 2:04 game. Supplies done, the Storehouse button told me why it was grey and what unlocks it, and tapping open ground placed it. That is what I asked for last time. Builders are very tired though.                                                  |
| 130.7     | tap Move / add builders                       |          |            | Adding the other four as builders through Move / add builders.                                                                                                                                                                                       |
| 139.6     | tap                                           |          |            | The storehouse is visible on the map now. I tap it to add the four builders.                                                                                                                                                                         |
| 178.8     | stop                                          | FINISHED | 2:50       | About 6 real minutes, 2:50 game, storehouse 8 percent built. I stop here because my questions are answered: the grey button gave its reason, placement worked on the phone and builders could be added. I would carry on if I had more time tonight. |
