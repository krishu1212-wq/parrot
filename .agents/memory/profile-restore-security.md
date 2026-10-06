---
name: Profile restore security
description: Preserve existing recovery-key access while reconciling the master blueprint's Account-Code-only restore request.
---

The master blueprint requests Account-Code-only profile restoration, but the current restore flow also requires the existing recovery key. Preserve recovery-key protection until a backward-compatible migration is designed; do not invalidate recovery credentials or risk locking existing profiles out.

**Why:** Changing restore requirements can expose existing study profiles or make them unrecoverable.

**How to apply:** Revisit this constraint when implementing the restore portion of the master blueprint. Require an explicit, tested migration plan before weakening or replacing the recovery-key check.