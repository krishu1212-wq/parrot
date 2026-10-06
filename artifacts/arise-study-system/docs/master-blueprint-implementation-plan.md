# ARISE Master Blueprint — Audit and Implementation Plan

## Scope

Implement the master blueprint against the existing ARISE app. This is an
incremental completion plan, not a rebuild. Existing study state, histories,
account ownership, reward receipts, and legacy imports must remain intact.

The blueprint's first 46 numbered features are the solo study/RPG system. Its
later sections add Guilds, social features, accessibility, search, and quality
requirements.

## Audit snapshot

### Already present in the codebase

- New Guest profiles, unique Account Codes, profile-scoped device/cloud study
  state, settings, logout, and explicit restore confirmation.
- Study-driven XP, levels, ranks, rank history, quests, mission/recovery flows,
  event history, records, streak evidence, and daily recommendations.
- Journey/phase progression, original Guardians, Gates, official weekly Boss
  tests, Boss retests, weakness evidence, and saved study statistics.
- Inventory, fictional items, equipment/loadout, achievements/relics, and
  persistent reward receipts.
- Maths, NCERT, vocabulary, timed calculation, multiple lecture batches,
  training, AI Coach, saved concept relationships, focus, wind-down, workout,
  and experiments.
- Original-looking ARISE artwork, System animations, reduced-motion handling,
  synthesized sound assets, haptic/sound preferences, and Android/Expo config.
- Play Store preparation documentation and a custom app icon.

These systems are not assumed complete solely because their routes or files
exist; each phase below calls for behavior-level verification.

### Missing or incomplete

- Guild domain rules, API, persistence, screens, invitations, Sunday tournament,
  saved-event submissions, review, leaderboard, and a shared Guild achievement
  are now implemented. Private evidence-file uploads and authenticated
  multi-profile end-to-end verification remain incomplete.
- No global search across the requested study/RPG/Guild records was found.
- No authorized-material upload/rights/retention pipeline or source-tracked
  question-bank engine was found. Existing practice and AI Coach functionality
  is not a substitute for that pipeline.
- Play Store preparation is documentation/configuration only. There is no
  verified production AAB, publisher signing, Play Console submission, or
  real-device release evidence.
- Account restore currently requires both Account Code and recovery key. The
  master blueprint specifies Account-Code-only restore. Existing profiles and
  recovery credentials must not be invalidated while reconciling this difference.
- Actual INR payouts are not implemented. They must remain disabled until
  eligibility, jurisdiction, provider, fraud, terms, privacy, and operator
  approval requirements can be verified.

## Phase A audit result

- `pnpm --filter @workspace/arise-study-system run typecheck` — passed.
- `pnpm --filter @workspace/api-server run typecheck` — passed before Phase A.
- `pnpm --filter @workspace/arise-study-system test` — 207 passed, 4 skipped,
  0 failed (211 total).
- The additional 25 XP is a separate, idempotent achievement receipt; the
  qualifying Boss scenario has its own receipt. Tests now distinguish those
  rewards from canonical lecture/quest XP.
- NCERT completed-book coverage now exercises a catalog book after recorded
  sessions. Focus timer tests use a realistic epoch and commit the foreground
  transition before advancing the resumed timer.
- VM-backed tests now normalize cross-realm values and provide the production
  dependencies they load.
- Four old/new write interleavings remain visible but skipped because they use
  separate module graphs (different app runtimes), not a provider remount in
  this Expo process. Shared-runtime queue, remount, ownership, and retry tests
  pass. No cross-process storage lock is claimed.
- The Account-Code-only restore difference remains unresolved; existing
  recovery-key access is preserved.

## Safe implementation phases

### Phase A — Persistence, ownership, and migration safety

1. Reproduce each baseline failure and classify it as a production defect,
   stale assertion, or test-harness defect.
2. Fix genuine lost-update, partial-write, wrong-profile, malformed-data, and
   duplicate-reward defects before adding social or financial features.
3. Test with the same module/storage runtime used by the app for provider
   remounts; keep isolated runtimes only for cross-instance scenarios.
4. Preserve legacy shelf aggregates, study history, progress snapshots,
   inventory, and reward ownership.
5. Resolve the Account-Code-only restore mismatch without silently locking out
   profiles or weakening recovery for existing users.

**Exit criteria:** typechecks pass; data-boundary tests prove old progress and
backups survive reload, migration, retries, profile switching, and malformed
optional RPG fields; reward IDs remain exactly-once.

### Phase B — Core study-to-progression loop

Verify and complete XP ownership, level/rank transitions, all rank definitions,
daily/weekly/long-term/recovery/gate/boss quests, daily briefing, mission
completion, event history, and personal records. Keep all rewards traceable to
real, idempotent study events.

**Exit criteria:** canonical actions create the expected signed XP/history
events once; undo/retry/reload cannot farm rewards; ranks require real
progression evidence.

### Phase C — Journey, phases, Gates, Boss, and weakness

Verify prerequisites and existing phase compatibility, journey unlocks,
Guardian coverage, Gate deadlines/rewards, official weekly Boss eligibility,
Boss revision/retest history, and evidence-based weakness recommendations.

**Exit criteria:** no manual or historical action fabricates a completion,
accuracy score, Boss result, weakness, or reward; Gates do not replace the
official weekly Boss.

### Phase D — Inventory, equipment, achievements, streaks, and analytics

Verify item quantities, use/equip/unequip effects, bounded XP modifiers,
achievement evidence, streak boundaries, relic ownership, and historical
analytics/records.

**Exit criteria:** equipment only changes future eligible awards; every receipt
has one source event; seeded defaults do not imply historical achievements.

### Phase E — Study trackers and training

Verify NCERT catalogs and legacy aggregates, word-level vocabulary evidence,
question-level calculation evidence, lecture status/links, multi-batch
switching, subject locks, and training sessions.

**Exit criteria:** only explicit learner activity changes study progress; batch
switches preserve history; external course providers are not scraped.

### Phase F — Coach and study-support tools

Verify AI Coach requests and failure states, real-data recommendations,
concept-map persistence, Recovery, 7-day experiments, wind-down, focus/break
timers, and the safe workout flow.

**Exit criteria:** AI/configuration failures are explicit; no background paid
probes; elapsed time alone cannot claim study completion or grant XP.

### Phase G — System presentation, interaction, and sound

Complete a screen-by-screen visual pass using contextual ARISE colors, original
assets, readable content surfaces, responsive layouts, reduced motion,
optional synthesized sound, haptics, notifications, and the cinematic opening.

**Exit criteria:** inspect real screens at phone and web sizes; animation/audio
settings are honored; no art obscures controls or evidence.

### Phase H — Guilds, Sunday tournament, and rewards

Add server-authoritative, profile-owned Guilds with a hard 12-member cap,
shareable join codes, privacy-limited member summaries, leave/join rules,
Sunday tournaments, duplicate-resistant task submissions, evidence upload and
review states, contribution/leaderboards, Guild achievements, and only
fictional in-app rewards. Current submissions reference a qualifying saved
study event and may include an optional note; no file upload is exposed until a
private Expo-compatible storage path is available and tied to the active profile.

Contribution is derived from real, bounded study events and quality signals;
client-submitted XP or correctness is not trusted. A screenshot or self-marked
answer is evidence, not proof of correctness. INR amounts/payouts remain
disabled until all compliance and provider gates have been approved.

**Exit criteria:** two profiles can create/join/leave; the 13th member is
rejected; unauthorized profiles cannot read or mutate Guild data; weekly
windows and evidence statuses are deterministic; reward claims are idempotent.

**Status (2026-10-04): partial.** OpenAPI/codegen, additive Guild tables,
authenticated API routes, domain rules, and the Expo list/detail flows are in
place. API and Expo typechecks pass; the three Guild domain tests pass; the
existing mobile suite reports 207 passed, 4 skipped, and 0 failed. API health
returns 200 and an unauthenticated Guild request returns 401. The signed-in
Guild UI and two-profile database lifecycle were not verified in this session.
Submissions validate saved event references but do not independently prove
answer correctness; client XP and correctness are not used.

### Phase I — Search, authorized question architecture, Android, and release

Add global search across the specified local records; complete accessibility
and Android stability checks; document the authorized-material/question-engine
contract with provenance, rights, tenant isolation, deletion, and no XP for
ingestion; complete Play readiness documentation and distinguish prepared
configuration from a tested release.

**Exit criteria:** search results are scoped to the active profile/Guild;
small-screen/reduced-motion/touch/accessibility checks pass; no publishing,
signing, or financial transfer occurs without explicit approval and required
publisher/provider setup.

## Global invariants

- Never delete or reset existing user progress.
- Never fabricate academic statistics, accuracy, Boss results, questions
  sourced from unauthorized materials, or achievement history.
- Every XP/item/reward receipt has a source identity and duplicate protection.
- Guild state cannot mutate a member's individual study state.
- Keep cash rewards off until compliance is verifiable; no pay-to-win or
  harmful over-study incentives.
- Report implemented, partial, and blocked features separately; report only
  tests actually run.