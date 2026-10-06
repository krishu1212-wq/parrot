# ARISE: The Solo Leaving

An incremental, mobile-first SSC CGL study system with the existing dark ARISE System-style interface.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server; use its managed workflow and injected `PORT`
- `pnpm --filter @workspace/arise-study-system run typecheck` — mobile typecheck
- `node --test artifacts/arise-study-system/scripts/*.test.mjs` — isolated study, storage, account, mission and achievement regressions
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Preserve the original anonymous storage key and intentional initial progress. Authenticated accounts instead start clean and use isolated Clerk-user vaults; anonymous import is explicit, never automatic.
- Cloud saves use verified server identities and revision compare-and-swap. Do not replace conflicts with whichever snapshot has the highest XP; retain both copies and require a provable common baseline for automatic merging.
- Account state, base revision and metadata must commit together through the recovery journal. Check provider ownership both before staging and inside queued writes, including after unmount.
- Focus timers are transient. Mission completion and rewards come from existing canonical study records; ending a Focus session cannot award extra XP.
- Preserve the established Phase 2 prerequisites and accepted Recovery behavior; do not add Vocabulary completion as a new unlock requirement.

## Product

- The Expo app is the main product. AsyncStorage supports local study progress; authenticated progress also syncs through the API to per-account PostgreSQL records.
- Batch → subject → topic → lecture records drive course progress. Keep the original batch/history when adding future courses.
- Existing daily quests, rank/XP/streak, NCERT and Black Book progress, calculation practice, and Coach must stay functional during incremental improvements.
- The master upgrade adds onboarding, secure account controls, Daily Briefing, record-backed Focus, Weakness Radar, Journey Map, Status and original ARISE rank/guardian/boss/relic visuals. Preserve the existing Coach's configured AI and offline behavior; never use paid background requests merely to probe readiness.

## Authentication configuration

- Authentication is Replit-managed Clerk. Google SSO is configured in the workspace Auth pane, separately for Development and Production.
- The Expo development command forwards the managed publishable key without exposing the server secret. Development Clerk uses its direct frontend API; the canonical `/api/__clerk` proxy is production-only.
- Published/native builds need the appropriate public Clerk key, API hostname (`EXPO_PUBLIC_DOMAIN`) and canonical production proxy setting. Never substitute the development hostname for a production URL.
- New deployments need the additive `study_account_states` schema. Do not run destructive schema changes or replace an existing database.
- Browser checks must use isolated contexts and synthetic local fixtures. Never mutate the creator's actual progress, spoof production authentication, or send paid Coach requests during regression checks.

## User preferences

- Preserve the existing ARISE identity, working UI, animations and study data. Do not rebuild from scratch, reset progress, replace saved data with samples, or remove working features.
- Inspect before editing; use incremental, safe changes with typechecks, targeted tests and Preview verification.
- Never remove earned XP or historical sessions when changing future course counts. Use archival, not deletion, for untouched excess lectures.
- Keep animations lightweight and respect reduced motion. Future audio must be original/licensed, never copyrighted Solo Leveling sounds.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
