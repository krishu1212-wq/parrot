---
name: Expo Metro module IDs
description: Diagnose numeric unknown-module errors without confusing stale development graphs with missing packages or damaged study data.
---

Numeric Metro module IDs are local to a bundler graph, not stable package identifiers. Check the live bundle's registered modules and dependency references before attributing an unknown-module error to a package or component.

**Why:** An editor-associated numeric-module error was not reproduced in a fresh full bundle: the editor's imports resolved, the referenced number mapped to development logging code, and every dependency was registered. This supports a stale development-graph explanation, but does not prove the original cause without reproducing the old registry.

**How to apply:** Rebuild Metro's module/cache graph and verify a fresh Preview when imports resolve. Treat Metro cache and study persistence as entirely separate: never clear study storage to resolve bundling errors. Do not assert a missing dependency or definitive original cause solely from an old numeric ID.