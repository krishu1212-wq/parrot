# ARISE — Play Store preparation (master brief §43)

## Status and release identity

This is **configuration and draft documentation only**, not a release certification.
No EAS project was linked, credentials created, build run, AAB signed, Play account
changed, or store submission made as part of this work. Production URLs, EAS project
ID, signing fingerprints, and uploaded version codes are unknown.

| Item | Prepared value / action |
| --- | --- |
| Expo display name | ARISE: The Solo Leaving (preserved) |
| Expo slug / OAuth scheme | `arise-study-system` (preserved) |
| Proposed Android application ID | `com.arise.sololeaving` (none previously configured) |
| Marketing version | `1.0.0` (preserved) |
| Local initial Android / iOS build values | `versionCode: 1` / `buildNumber: "1"`; not evidence of a build |
| Production Android format | AAB through EAS `production` profile |
| Signing source | EAS-managed remote credentials; no keystore/password in repository |
| Icon | Existing custom 1024×1024 ARISE crystal artwork retained; reused for adaptive foreground |

The publisher must approve and check availability/ownership of the proposed application
ID before the first Play upload. It becomes permanent for that listing. No iOS bundle
identifier was invented; iOS distribution is outside this preparation.

The current icon is custom, not the Expo placeholder. Its decorative outer border may
be cropped by adaptive masks: inspect round, squircle, and themed launcher rendering on
Android before submission. A dedicated transparent safe-zone foreground can be prepared
later from owned artwork if masking is unacceptable. No image-generation call was made.

## Build and signing handoff — operator actions, not executed

Run release commands from `artifacts/arise-study-system`, in an authorized release
environment with the workspace dependencies installed. The publisher must:

1. Sign in to the correct Expo organization, link/create the correct EAS project using
   `eas init`, and verify the resulting project ID and ownership. Do not invent an
   `extra.eas.projectId` in source.
2. Configure the EAS **production** environment with actual values:
   - `EXPO_PUBLIC_DOMAIN`: deployed API **hostname only**, no scheme/path; current
     clients construct `https://${EXPO_PUBLIC_DOMAIN}` and use `/api` routes.
    Profile sessions use the API's signed ARISE profile tokens; there are no client auth
    provider keys to configure. A preview environment must use its own deliberately
    selected backend values. Never embed session signing secrets,
   database URLs, AI credentials, signing keys, or Play service-account credentials.
 3. Deploy/verify the HTTPS API, database schema, server-side ARISE profile-token verification, CORS
   where relevant, and server-only AI configuration. The development start script's
   Replit variables do not automatically provide production EAS environment values.
4. Inspect Expo resolved configuration with `pnpm exec expo config --type public`.
   Confirm the application ID, icon paths, config-plugin compatibility, and native
   permissions. Unused camera, microphone, and location permissions are blocked;
   audit the **built merged manifest** for other permissions introduced by dependencies.
5. Initialize/check remote Android version state with `eas build:version:set` before
   the first release. `appVersionSource: remote` and production `autoIncrement: true`
   make EAS authoritative for subsequent build numbers. Local `1` is a starting value,
   not a claim about the next uploaded build. Every upload needs a higher version code.
6. With publisher approval, use `eas credentials --platform android` to select/create
   EAS-managed upload credentials. Keep backups/access under publisher control, never
   in git. Configure Play App Signing in Play Console: Play's app-signing key and the
   EAS upload key have different roles. Existing signing identity must never be replaced
   casually when updating an already published app.
7. Only after the above gates, build with `eas build --platform android --profile production`.
   Inspect its actual version, signing certificate, target SDK, manifest, supported
   devices, and native library/16 KB page-size compatibility. Expo SDK choice alone
   does not prove Play policy compliance.
8. Manually upload the resulting AAB to an internal test track first. This file contains
   no auto-submit profile or service-account key. A separate preview APK profile exists
   for device checks but cannot prove Play-distributed signing/auth behavior.

There is intentionally no hardcoded target API override. Confirm the Play Console
target API requirement effective on the intended submission date, including the
official annual deadline/extension rules, against the actual generated AAB.

## ARISE profile recovery — release blockers until externally verified

New profiles receive a random Account Code and a separate random recovery key. The
server stores only a salted hash of the recovery key. Restoring requires both values and
an explicit confirmation; the Account Code alone must never authorize recovery. Native
sessions use SecureStore. Logout clears only that device's session and must not delete
the profile or synced progress. Existing Google-linked records are retained and are not
automatically opened or migrated by the new profile flow.

The server stores profile-owned study snapshots in PostgreSQL with revision checks; the
client keeps profile-scoped local state and conflict handling. Only confirmed cloud
progress can be recovered after reinstall. Offline edits remain device-local until
synced. Android OS backup is disabled in config; this does not remove existing cloud
records or implement account deletion.

Required device evidence, with tester/build/version/date recorded:

- [ ] Install the Play internal-track release, create a New Guest profile, and verify
  clean initial progress plus authenticated cloud read/write.
- [ ] Save the Account Code and recovery key separately; verify Account Code-only and
  wrong-key attempts fail without exposing profile data.
- [ ] Create identifiable progress, wait for confirmed sync, uninstall, reinstall from
  Play, enter both recovery values, explicitly confirm, and verify exact recovery.
- [ ] Verify logout leaves cloud data and credentials intact, clears the local session,
  and does not automatically reopen the profile.
- [ ] Test two profiles/devices, divergent updates, offline edits, network failures,
  retry, and conflict choices without silent data loss.
- [ ] Verify a New Guest stays clean and old Google-linked records remain untouched.

**Production profile recovery, release signing, and Play distribution have not been
tested by this preparation.** Code review or a web preview cannot close these gates.

## Privacy policy working draft — not publishable as-is

The operator must supply its legal identity, support/privacy contact, effective date,
public policy URL, processing locations, retention schedule, and deletion request URL.
Publish a publicly accessible, non-geofenced HTML policy linked from both the app and
Play Console. Do not publish unresolved draft fields or claim a deletion SLA.

Suggested policy language, subject to operator/legal review:

> ARISE helps learners plan and record study activity. A profile uses a generated
> Account Code and a separate recovery key; we do not ask for a Google account or email.
> We associate study records with a random ARISE profile identifier to sync progress to
> our hosted database. The recovery key is stored as a salted hash; the Account Code is
> stored to locate the profile. Device-local study state is also stored so supported
> workflows can continue offline. Logging out clears the device session, not the cloud
> profile or its study data.
>
> When you choose an AI Coach tool, the text you submit and, for tools that need it,
> the selected progress summary are sent to our API and AI processing provider.
> Do not submit sensitive personal information or material you are not authorized to use.
> Generated guidance may be inaccurate and is not a promise of exam results.
>
> Service infrastructure and providers may process request metadata such as IP addresses
> and operational logs. We use these services to authenticate accounts, sync study
> progress, deliver requested AI assistance, and protect service availability.
> The deployed providers' retention and security practices must be described here
> after verification. We do not promise zero retention by upstream AI providers.

Reviewed paths: `contexts/AriseAccountContext.tsx`, `services/accountCloudSync.ts`,
`coach/coachClient.ts`, API `routes/study-account.ts`, `lib/study-account-db-store.ts`,
`routes/coach.ts`, and `lib/logger.ts`. No separate auth/cloud architecture document
or PDF ingestion contract was found in application docs at review time.

**Deletion blocker:** reviewed account routes expose GET/PUT, not a verified complete
account deletion workflow. Before release, implement and test in-app account deletion
and a public external deletion-request path, covering ARISE profile credentials, database state,
local caches/backups and any retained provider data. Specify justified legal/security
retention exceptions and timelines. Resetting local progress, uninstalling, or deleting
only the ARISE credentials does not prove deletion of the cloud study record.

## Google Play Data safety worksheet — draft, operator must validate

Inventory the final binary, deployed logging, and every third-party SDK/provider.
Off-device transmission can be collection even when processing is transient.
Service-provider transfers may qualify for Play's sharing exception only if the actual
contracts and purposes satisfy Google's definition; do not automatically answer
“no data collected” or “no sharing.”

| Candidate category | Observed processing / purpose | Release decision needed |
| --- | --- | --- |
| Personal info: user IDs, name/profile | Random ARISE profile ID, display name, Account Code and per-profile settings; cloud rows keyed by profile ID | Confirm the final fields, recovery flow and retention; no email or Google identity is requested |
| App activity / other user-generated content | Study plans, progress, attempts, reflections and saved records in account snapshot | Map exact state fields to Console taxonomy; account management and app functionality |
| Other user-generated content | User-selected notes, questions, material and coach inputs sent to API/AI provider | Disclose optional AI processing and actual provider terms/retention |
| Device or other IDs / diagnostics, if applicable | API and infrastructure metadata/logging | Verify actual network behavior and log fields; do not assert absent based on source alone |

Code reviewed uses HTTPS when a hostname is configured and redacts auth/cookie headers
from the API logger. Neither proves encryption at rest, full logging minimization, or
provider compliance. Verify transport end-to-end and answer encryption-in-transit only
after deployment validation. No advertising SDK was observed in the reviewed app paths;
confirm the complete dependency/runtime inventory before declaring ads or tracking absent.
Camera/location packages are installed but no feature calls were found; config blocks
their permissions. Validate the final manifest instead of treating dependencies as usage.

## Store listing draft

**Title (23 characters):** ARISE: The Solo Leaving  
**Short description (71 characters):** Turn your study routine into quests, track progress, and build mastery.

**Full description draft:**

ARISE turns your study routine into a personal progression journey. Organize subjects
and lecture batches, plan daily quests, record practice and revision, and see your
progress through ranks, gates, guardians, and an evolving loadout.

Use focused study sessions, recall and mistake records to decide what to work on next.
Optional AI Coach tools help you reflect on material you provide; their answers may
need checking. New Guest profiles can sync when online. Recovery on another install
requires both the Account Code and its separate recovery key; only synced progress is
eligible for recovery.

ARISE tracks the activity you record. It does not promise automatic watch detection
on external learning platforms, supply unauthorized books, or guarantee exam results.

Publisher must confirm each advertised feature against the release build. Choose the
appropriate Education category, real support email, policy URL, audience declarations,
content rating, ads declaration, AI-generated-content policy compliance (including
reporting/flagging requirements where applicable), and app-access instructions.
Do not imply endorsement by third-party platforms.

### Assets and screenshots

- Existing `docs/screenshots/home-overhaul.jpg` and `gates-overhaul.jpg` are development
  references only, **not certified Play release screenshots**.
- Export an approved 512×512 Play listing icon from owned artwork, without transparency;
  the 1024×1024 launcher asset is not itself the required listing upload size.
- Prepare a 1024×500 feature graphic (JPEG or 24-bit PNG without alpha).
- Capture at least two genuine phone screenshots of the final installed app; Play
  accepts JPEG or 24-bit PNG without alpha, 320–3840 px per dimension, with the longer
  dimension no more than twice the shorter. For promotion eligibility follow the current
  Console guidance for at least four high-resolution 9:16/16:9 screenshots.
- Show Home, daily quests, planning/batches, recall/revision, gates/loadout and account
  sync states accurately; no fabricated progress, unsupported features, personal data,
  copyrighted external course content, or development overlays.

## Final release checklist

- [ ] Publisher account verification, payments/agreements as applicable, package
  ownership and Play App Signing completed by the authorized publisher.
- [ ] Check current Play eligibility. New personal developer accounts subject to the
  testing gate generally require **12 opted-in closed testers for 14 continuous days**
  before applying for production access; verify the account-specific Console requirement,
  complete any physical-device verification, and do not count internal testing as that gate.
- [ ] Production backend values, Account Code + recovery-key restoration, reinstall recovery and account
  isolation checklist above completed on Play-signed devices.
- [ ] Privacy policy and both account deletion paths implemented, operational and tested;
  Data safety, content rating, audience, AI content policy and app access forms reviewed.
- [ ] Reviewer access instructions use a dedicated test profile and a secure, approved
  delivery method for its recovery credentials; do not expose user credentials.
- [ ] Built AAB passes Play pre-launch report and required target API/16 KB compatibility;
  review crashes, ANRs, startup, permissions and all native SDK declarations.
- [ ] Low/mid-range Android device checks: portrait/small screens, text scaling, contrast,
  TalkBack, touch targets, reduced motion, offline resume, session timer/backgrounding,
  midnight/timezone boundaries, kill/relaunch and update migration.
- [ ] Verify icons under launcher masks, actual listing screenshots, no trademark/copyright
  infringement, and no unsupported “tested,” “secure,” or guaranteed-recovery claims.
- [ ] Record release version/code, AAB checksum, signer fingerprints, environment ownership,
  tester evidence, policy URLs and rollback/incident plan in the publisher's release record.

## Future authorized-material ingestion interface (§42)

The existing `/api/coach/respond` request supports user-provided text and one-question
generation; it is **not** a PDF/book upload, indexed corpus, or rights-management pipeline.
No current dedicated ingestion contract was found. The following is a proposed interface
only: no endpoints, uploads, parsing, scraping, corpus, or jobs are implemented here.

1. Authenticated `POST /api/materials/ingestions`: accept material display metadata,
   `sourceKind` (`owned-upload` or `licensed-upload`), a rights attestation/evidence
   reference, permitted uses (parse/index/question-generation), retention choice and an
   idempotency key. Server obtains owner ID from verified auth, never trusts caller owner.
   Reject absent rights, unsupported types and oversized requests with explicit errors.
2. Return `{ ingestionId, status, uploadInstructions }` only after server validation.
   Actual future upload instructions must be short-lived and owner-bound. Malware scan,
   MIME/size checks, quotas, encrypted private storage and license review precede parsing.
   No arbitrary external-URL fetching or third-party platform scraping.
3. Authenticated `GET /api/materials/ingestions/:id` reports
   `awaiting-upload | rights-review | scanning | parsing | indexing | ready | failed`,
   including structured errors. Parsed passages carry document/version/checksum,
   page/section provenance, usage rights and parser version.
4. A future question service consumes only `ready` authorized passages. Each question
   carries source passage/page references, verified answer/review status, subject/topic
   mapping and difficulty. Generated content needs validation before publication.
5. Practice/recall results reference question and source versions, feeding weakness,
   Boss and revision scheduling through explicit existing study-state transitions.
   Indexing or AI generation itself must never grant XP or invent completed activity.
6. Authenticated `DELETE /api/materials/:id` revokes retrieval and cascades licensed
   source/index/derived-content removal according to the agreed retention policy.
   Enforce tenant isolation, audit access without logging source text, and document
   whether AI provider transfer is allowed by that material's license.

Implement this separately only when authorized content, provider rights, operational
storage/deletion policy and ingestion consent UX are actually available.