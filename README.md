# Commonstead

A ten-minute residential workshop near Mill Bridge with eight Human Framework people. Build a storehouse before the storm to keep the shared supplies dry. Direct control gives way to fatigue, recovery and remembered pressure.

- `pnpm install --frozen-lockfile`
- `pnpm run dev`
- `pnpm run ci` — lint, strict typecheck, focused tests, stamped build.
- `pnpm run deploy` — clean tree and green exact-commit GitHub ci required.

Design and owner acceptance boundary: [docs/concept.md](docs/concept.md). Reviews: [docs/reviews](docs/reviews/). Original Canvas art and text; no game assets or code borrowed from commercial or open-source RTS games. Static assets only. HF package 3.0.0 (person engine 2.23.0) owns people; this host owns map and economy. The app version is 0.2.0; the replay rules are `commonstead-3`. Immutable lab-client 0.4.11 and lab-kit 0.5.12 provide the shared lab controls.

## How to play

Choose New game for the default ten-minute chapter, or Resume to reopen the game saved on this device. Finish a storehouse by 10:00 to keep the shared supplies dry. Select residents by name or on the map. Choose Meals, Boards or Ballast bags to assign work. On a computer, drag a selection box and right-click a destination. On a phone, drag a selection box and hold a destination to give an order.

Select builders, choose Storehouse, then tap open ground. It costs 180 boards and 120 ballast bags. Rest gives people a 35-second break before they resume work. Eat and drink uses meals in place. Insist on work can create remembered pressure. Slow, Steady and Fast change how quickly time passes. Controls and help (`i`) explains the actions. Help and the pause menu stop time.

The title also offers Feedback and “Choose a longer settlement day”. Choose “Start a settlement day” for the optional `settlement-day/1` edition with eight fresh local residents. It lasts thirty minutes at Steady and advances through a full day and night; the storm arrives at 20:00. An existing saved chapter requires confirmation and is replaced only after the new day is ready. In this edition, “Travel, conversations and the day” provides named destinations and building sites. View changes the displayed map; Travel asks residents to make a journey. Requests wait for current acts and can be refused.

HF models each resident's body, temperament, memory and willingness. Work raises exertion; the host uses HF state and responses to set work pace and handle requests. The native simulation owns resources, buildings, movement and weather.

## Saves, recording and files

The game saves locally after orders and every ten simulation seconds, and when page visibility changes. Resume keeps the residents pinned in that saved chapter. Default New game checks supported browser histories for all eight residents together when the shared history shelf is enabled. Automatic continuity does not mean every foreign history is supported.

The ordinary pause menu offers Resume, Feedback, Full screen, All games, one Recording switch and New game with inline confirmation. Recording links play across games on this device while enabled. DNT/GPC makes the initial recording default off; switching Recording on opts in. Feedback offers “I'm stopping” and “I'm confused”. Selecting one prefills the note and sends nothing; Submit sends the feedback. Feedback can send a note with recording off, with an optional unticked checkbox to share play. Character analysis has its own opt-in.

The public title links to `/file/` for a memory-only session using the complete game UI. Choose a native full or compact run. A full file must match the entire replayed state; compact input is labelled as reconstructed. Import stays paused until explicit Resume. Download the original bytes, original filename/type/lastModified/size/SHA256 metadata, and the complete current native export independently. Original source metadata stays inert and grants no browser ownership. Replies editions refuse nonempty source wrappers they cannot export. The ordinary title Debug import link opens the preserving `/file/` chooser.

File sessions never read or write the native save or recovery keys, instantiate the browser Shelf, or publish people. Leaving or reloading requires a new file selection. Each command/frame/yield batch stages the complete state and history before capacity measurement. Selected, expanded decoded and complete current export each have a5,000,000-byte limit; original plus current has a10,000,000-byte limit. Source archives separately allow100 entries and1,000,000 serialized JavaScript UTF16 units. Capacity refusal stops play and retains the last complete current export and original for download or reselection. No histories are trimmed.

File recording uses SDK15 preservation and the existing persistent Recording switch, including OFF and privacy signals. Only existing-local startup admits tracking; other statuses show the recording block and dispose before tracking. Local play and downloads remain available. SDK storage activity is separate from native game storage isolation. Shared full-day native departure remains refused; longer-edition ownership is separate engineering.

Current cast, continuity and native sender contract: [docs/cast-adoption.md](docs/cast-adoption.md). Exactly eight canonical residents open together. Browser history storage is optional. File ownership restrictions are separate from the single recording choice. Native exports retain source obligations; unsupported duties are not cleared. The finite Glance 4 / engine 2.23.0 Nerys receiver is shipped. The signed Glance producer/live and final receiving replay receipts are recorded separately in `~/code/.lab-scratch/v3/glance/report.md`. Those technical controls do not establish an ordinary human cross-game or shared-shelf CAS ownership journey. Dynamic release and browser receipts live outside source at `~/code/.lab-scratch/cast/commonstead.md`.

Use shared Node 26.12.0 and the exact pnpm 12.14.0 packageManager pin. No project runtime is downloaded. Existing npm worktrees must preserve dirty source, remove only their own root and workspace node_modules, run `pnpm install --frozen-lockfile`, then delete dist, .types and *.tsbuildinfo before rebuilding. `npm run` remains usable but bypasses pnpm's stale-dependency guard.
