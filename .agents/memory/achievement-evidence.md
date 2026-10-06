---
name: Achievement evidence
description: Avoid fabricated historical achievements when legacy saves are hydrated with seeded fallbacks.
---

Distinguish actual saved or newly recorded evidence from fields supplied by a seeded fallback. Retain genuinely earned relics after current conditions change, but report only an observed streak high-water mark, not an invented lifetime peak.

**Why:** Partial legacy saves can legitimately inherit starter values for display and compatibility. Treating those generated values as historical evidence can award relics that the saved data never established. A real saved streak can also disappear during daily rollover before an achievement evaluator sees it.

**How to apply:** Capture real saved streak evidence before rollover, recognize achievements only from trustworthy saved fields or subsequent canonical activity, and preserve that evidence across reloads. Missing historical records must remain unknown; do not reconstruct wins or earn dates from XP, reconstructed catalogs, or defaults.

For preservation tests, use a populated canonical snapshot for whole-state equality across reloads. When testing a partial legacy import, supply the evidence needed by existing normalization and assert the supplied progress, not missing/defaulted fields.

**Why:** Comparing a partial raw fixture to its hydrated state mistakes established normalization for a regression in the feature under test. Canonical action-built snapshots also exercise real saved quests, study records, and history rather than empty/default collections.

**How to apply:** Keep import-compatibility assertions separate from full-snapshot preservation assertions; check actual state records instead of guessing which derived values are exposed by the context.

Action-built preservation fixtures must still match the public record contracts; JavaScript tests can accidentally inject extra fields that established normalizers legitimately omit.

**Why:** Such fields can appear in the in-memory snapshot yet disappear on reload, producing a false preservation regression unrelated to the feature under test.

**How to apply:** Use supported record fields and canonical catalog versions when constructing fixtures. Do not weaken meaningful persistence assertions to accommodate unsupported test-only fields.