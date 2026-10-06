# ARISE rank system

The authoritative definitions are in `contexts/rankSystem.ts`. Earnable rank is
derived from canonical total XP **and** verified study evidence; it is not stored
as another copy of progression. The existing level formula remains
**floor(total XP / 1,000) + 1**.

| Rank | Minimum level | Minimum total XP | Active study days | Completed study activities |
| --- | ---: | ---: | ---: | ---: |
| E | 1 | 0 | 0 | 0 |
| D | 4 | 3,000 | 7 | 14 |
| C | 9 | 8,500 | 21 | 50 |
| B | 21 | 20,000 | 60 | 160 |
| A | 43 | 42,000 | 130 | 360 |
| S | 86 | 85,000 | 260 | 750 |
| SS | 141 | 140,000 | 450 | 1,500 |
| SSS | 221 | 220,000 | 700 | 2,600 |

Each higher rank requires all three thresholds. Progress is checked in ladder
order, so evidence cannot skip an earlier rank. SSS is the final earnable tier;
XP and level can continue increasing after it.

## Study evidence

Evidence is reconstructed from unique completed events in
`progressHistory.systemEvents`: `quest.completed`, `lecture.completed`,
`ncert.session`, `vocabulary.activity`, `calculation.session`, and `boss.activity`.
The event must have a valid date and a stable event or idempotency identity.
Active days count distinct recorded dates; completed activities count unique
qualifying events. XP awards, rank changes, generic events, and seeded totals do
not count as study evidence. Replaying the same event identity cannot inflate it.

Hidden and Transcendent artwork identities remain resolvable for historical
records but are not part of the earnable rank ladder.

## Existing saves and rank events

Hydration recalculates the current rank from existing XP and recorded study
evidence without changing XP, levels, or any study data. Legacy XP and aggregate
totals do not become fabricated activity evidence. Hydration does not invent
rank-change events or announcements.

A real before/after study mutation that changes the evidence-based rank appends
one `rank.changed` event to the existing durable progress history. It contains
both stable rank IDs and display names, the previous/new levels and XP, its
observed timestamp, and its ticket-based stable event ID/idempotency key.
Replaying the same mutation ticket cannot append a duplicate. A mutation that
jumps multiple tiers records one actual prior-rank → final-rank transition, not
synthetic intermediate activity. Real XP or evidence reversals recalculate rank
and record the change; only upward progression uses the rank-ascension
presentation. Rank events do not contribute evidence themselves.

## Artwork and future hooks

All eight earnable rank definitions specify their own crown variant, palette,
visual/aura tier, and announcement. Artwork uses the entire stable rank identity,
never the first character. Historical-only identities remain available for
legacy presentation, while unknown or malformed artwork input falls back to E.

`futureUnlockHooks` exposes the integration names `gates`, `inventory`, and
`equipment` on each rank definition. These are **available metadata hooks, not
active unlock grants**. No access policy has been assigned and none of those
systems is implemented in this step.