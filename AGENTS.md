# Commonstead

Authority: docs/concept.md. Done means the deployable vertical slice and evidence listed there; owner accepts after playing. Do not change human-framework or the lab index. Keep the actor engine at HF 3.0.0 and lab-kit at 0.5.17. Signed commits with Co-Authored-By: Codex <noreply@openai.com>. Run pnpm run ci before commits. No secrets in source or output. One browser. Stop under 5 GB free. Native simulation owns world only; HF owns people. Deferred work has a date in concept.md.

Commonstead uses the published immutable lab-client 0.5.0 artifact and its scoped HF 4.3.0 pure portable bridge. The actor engine stays at HF 3.0.0 / engine 2.23.0; lab-kit stays at 0.5.17. Human-framework PR38 merged in e22bca58; the v4.3.0 and lab-client-v0.5.0 GitHub release assets are published. Commonstead coordinator publication f93b3b8 is live with dirty:false. This is the scoped reciprocal Burak/Days source contract, not an actor upgrade or admission for every world. See [the source publication](https://github.com/adam0white/human-framework/pull/38) and `~/code/.lab-scratch/codex/carryover.md` for the receipts.

Use [the plain-English policy](docs/lab/plain-english.md) for player text.

TypeScript support is 7+. Use the normal `pnpm run check:lane` before every commit; here it runs `pnpm run ci` through the shared suite lock. Suite-lock maintenance delivered in 1e22d9a (CI 40242664724) fails closed after six unreadable-owner observations without deleting the unidentified lock. HF3 lab-panel rounds are allowed under the playtest director. Friends’ playtests and Show HN remain paused. Technical delivery does not imply owner acceptance.

Use shared Node 26.12.0 and pnpm 12.14.0. Install with `pnpm install --frozen-lockfile`. Preserve strict engines and peers, no hoisting, shared-store hardlinks, the one-day third-party release age and version-specific build approvals in pnpm-workspace.yaml. Do not download a project runtime.
