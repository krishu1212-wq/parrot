---
name: Legacy aggregate ownership
description: Preserve historical reading totals when older saved progress lacks trustworthy per-book events.
---

Treat saved shelf aggregates as the historical baseline when individual book/session details were reconstructed. Apply only actual new reading and vocabulary activity to that baseline; do not replace it with totals inferred from synthetic book records.

Explicit empty or partial catalogs are saved user data, not a request to restore starter defaults. When no historical shelf aggregate exists, use actual saved book events instead of assuming zero.

**Why:** Older progress did not record enough per-book events to reconstruct historical sessions or words accurately. A completed-book count does not prove how many reading sessions occurred, and a vocabulary count does not identify the words. Recomputing those fields can invent history and silently change the user's totals.

**How to apply:** During catalog/migration work, retain original aggregates and an independent detail baseline, apply subsequent real activity deltas, and make repeated hydration idempotent. Preserve existing explicit book/vocabulary records; never generate vocabulary words merely to fill an old count.