# Commonstead implementation plan

Goal: deliver the owner-authorized vertical slice in concept.md. Native coordinator builds the browser UI and deployment; a scoped agent owns simulation and focused tests. New repository isolates this work from all existing projects.

1. Concept: obtain two independent reviews and resolve concrete findings before building. Done.
2. Simulation (`src/sim.ts`, `test/sim.test.ts`): fixed one-second ticks, five HF people, resources, construction, train, orders, in-place recovery, body pace and remembered pressure, storm at tick 600. Test replay hashes, export/import equality and a matched tired-worker control. Tests first. UI consumes exported typed API.
3. UI (`src/main.ts`, `src/draw.ts`, `src/style.css`): Canvas map, pointer controls, named alternatives, five screens, autosave, telemetry notice/off switch, feedback with name, import/export. Browser verifies gestures and readable phone layout.
4. Delivery (`scripts/deploy.mjs`, workflow, wrangler): signed commits, private repo and required ci; deploy only clean exact green commit. Verify release.json and live asset behavior with one Chromium browser at two sizes.
5. Evidence: concept reviews, focused tests, strategy comparison, browser results, proposed ledger/index and final report. Owner play/acceptance remains separate.

Constraints: exact HF 2.14.1; vendored lab-client 0.2.1/lab-kit 0.3.1; no HF edits, no index edits, no secrets. No borrowed game assets/code. Below 5 GB free stops work. Desktop/touch gesture cancellation, export validation, pause/resume, late warning and consent-off export are review focus.
