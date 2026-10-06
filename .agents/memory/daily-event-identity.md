---
name: Scoped event identity
description: Scope canonical history identities by study day or nested activity path.
---

Recurring quests have a day-scoped identity. A midnight reset is neither an undo nor a new study activity. The same quest checked on consecutive days represents two separate completions.

**Why:** Daily quest IDs are reused and their checkboxes reset without subtracting canonical XP. Comparing checkbox values across dates can invent a reversal or conceal a genuine new award.

**How to apply:** Include the canonical study day in recurring-action identity and compare new-day completions against the new day's baseline. Derive streak evidence from real observed activity, never from the rollover itself.

Nested lecture identifiers are collection-local unless global uniqueness is explicitly enforced. Use the full batch/subject/topic/lecture path for transition matching and event idempotency.

**Why:** Valid saved batches can reuse lecture IDs. Bare-ID matching can invent an old completion during a settings change or suppress a genuine completion in another batch.

**How to apply:** Keep readable related IDs in metadata, but build collision-safe canonical identities from the complete nested path. Do not reject previously valid saved progress merely to simplify logging.