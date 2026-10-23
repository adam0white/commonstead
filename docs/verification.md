# Verification

Focused tests cover deterministic replay/state hash, exact export/import including tamper rejection, tired-work control, idempotent ordinary orders, in-place recovery, food reservation and interruption, movement, placement and queued training. `npm run ci` runs lint, strict typecheck, tests and build. The deployment script requires clean Git and exact-commit green ci.

Two concept reviews and one implementation review are in docs/reviews. These are independent Codex agents with distinct personas, not human playtests. Builder resolutions are separate from reviewer findings.

Local Chromium emulation at 360×690 and 1280×800 checked title/play/feedback, stock and deadline, named selection, resource orders, recovery, no page overflow, recording-off disabled Send, export with recording off, and same-time Continue. One Chromium instance was used sequentially. Live verification is recorded outside the repository at ~/code/.lab-scratch/new-game/report.md with screenshots in shots/. These are not physical-phone tests. Owner play and cold-human tests remain unperformed.

GitHub branch protection PUT returned HTTP403: “Upgrade to GitHub Pro or make this repository public to enable this feature.” Repository remains private as requested. The ci workflow and deploy guard exist, but GitHub does not enforce a required main check on this account plan.
