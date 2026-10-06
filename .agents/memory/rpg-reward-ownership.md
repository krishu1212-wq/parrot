---
name: RPG reward ownership
description: Preserve canonical XP and official Boss behavior when extending Gates, rewards, and equipment.
---

Canonical daily quests own their base XP. Equipment bonuses are separate signed receipts; undo removes the originally earned bonus even if equipment has since changed. Process canonical quest attribution once, then finalize RPG receipts and the prior-to-final rank transition without replaying base quest attribution.

**Why:** Re-running canonical attribution against an already-updated ledger can create another quest award ordinal. Inferring RPG XP from a residual delta also obscures which reward actually owns the XP and can permit equipment-toggle exploits.

**How to apply:** Commit study evidence, Gate completion, XP, items, claims, and history in one atomic study snapshot. A Gate requires new canonical activity after entry, never historical or reconstructed progress. Preserve absolute deadlines across backgrounding and reload.

Gate-specific Boss practice is separate from the official weekly Boss test, even when both use the same saved review cards.

**Why:** The official Saturday workflow and one-official-test-per-week rule must remain unchanged, while an entered Boss Gate needs a usable challenge on other days.

**How to apply:** Validate the live Boss attempt, bound batch, real saved cards, and deadline. Keep Gate records separate and exclude them from official weekly eligibility; never replace an official result.