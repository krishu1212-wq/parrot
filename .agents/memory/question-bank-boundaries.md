---
name: Question Bank boundaries
description: Source fidelity, hierarchy, and progression safeguards for the ARISE Question Engine.
---

- Preserve the source hierarchy exactly: Subject → Chapter → Class/Lecture → Topic → Source Notes → Questions. Keep classes, lectures, topics, and sources isolated by their parent IDs.
- Do not generate, paraphrase, or silently correct questions, options, answers, or solutions during import. If a source answer or difficulty is missing or ambiguous, keep it ungraded/unrated and flag it for review.
- Store attempts and revision state under the active ARISE profile and tie each attempt to the exact question version/source.
- Connect the Question Bank to XP, quests, the Weakness Radar, mistakes, revision, retests, Gates, Weekly Bosses, Guild tournaments, and analytics only through explicit adapters using validated saved attempts. Do not alter existing progression rules as part of Question Bank architecture.
- Do not bulk import before the source files have been inspected and the import flow has been reviewed.

**Why:** The user plans to provide a large note collection later and requires source-faithful, class-isolated imports without fabricated content or accidental progression changes.

**How to apply:** When files arrive, first inventory their exact structure and provenance; stage extraction for review, then import idempotently by source/version. Implement progression links as separately testable adapters.