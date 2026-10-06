---
name: Level-up reward attribution
description: Safe rule for deciding which durable reward receipts belong to a specific level-up.
---

Only display a reward in a level-up reveal when durable evidence links that receipt to that exact level-up. If there are no explicitly linked receipts, show “NO NEW REWARDS.” Do not infer attribution from matching dates, timestamps, or aggregate XP.

**Why:** The Level-Up brief requires real rewards and forbids fabricated or duplicated awards, while the presentation must not take ownership of reward logic or persistence.

**How to apply:** Before adding reward cards, inspect the saved event relationship. Render only explicitly linked receipts; otherwise render the empty state. Add event linkage only when the user approves work beyond presentation-only scope.