# RPG domain contract

The pure domain is `contexts/rpgCatalog.ts` plus `contexts/rpgSystem.ts`. It has
no React, storage, native API, or random-number dependencies. The host owns the
canonical StudyState/history transition and stores the returned `rpg` field in
the same snapshot as XP and study progress.

## Gates and eligibility

The four catalog IDs are `gate-maths-lecture` (Normal, Level 1/E, 20 minutes),
`gate-ncert-depths` (Difficult, Level 6/B, 30 minutes),
`gate-calculation-citadel` (Special, Level 3/C, 10 minutes), and
`gate-boss-record` (Boss, Level 12/A, 30 minutes). Rank and level are both
checked using the canonical 1,000 XP-per-level rank rules. Gate unlocks derive
from actual total XP. Initial state/normalization sets eligible flags without
inventing unlock history. Later false-to-true eligibility transitions append
one `gate.unlocked` event and enqueue that event for presentation.

Only an active attempt can advance. Entry binds it to the active batch; one
attempt is globally active at a time. `advanceRpgStudyState` accepts only
newly recorded canonical activities timestamped after entry and before the
absolute stored deadline. Batch switches do not count. The Normal
objective is one Maths lecture completion; Difficult is two NCERT session
events; Special is a new calculation-session ID with at least 10 questions
and 80% accuracy; Boss is a new boss-record ID with at least five questions
and 80% accuracy. A clear is permanent and one-time per gate. Failures and
abandonments do not award XP/items; failed gates may be retried. `refresh-clock`
expires attempts without polling or per-second state writes. Hydration alone
does not expire an attempt.

Boss evidence must be a record newly added after entry; a previously saved
official weekly record cannot qualify retroactively. Official records without a
Gate tag can qualify while the matching-batch attempt is active. If a record
does carry `gateAttemptId`, it is accepted only when that ID equals the active
attempt. Attempt/event identity is derived from the supplied ticket, never a
random ID generated while React evaluates a state updater.

Clear reward tables are:

| Gate | Base XP | Guaranteed items |
| --- | ---: | --- |
| Normal | 120 | 2 Revision Tokens, 1 Gate Key, 15 Study Coins, 1 Training Quest Seal |
| Difficult | 180 | 1 Scholar Core, 2 Relic Fragments, 1 fictional Life Potion, 1 Revision Relic |
| Special | 150 | 1 Calculation Gauntlet, 2 XP Crystals, 1 Focus Crystal, 1 Sentinel Sigil |
| Boss | 250 | 1 Reward Chest, 50 Study Coins |

The optional Focus Crystal/Achievement Relic Gate XP bonus is combined and
capped at 10%, rounded down per award. Any RPG XP award/reversal is represented
by an RPG event with explicit `xpDelta`/`xpSource`; the host should mirror these
events into its durable XP/history ledger atomically with `totalXp`.

## Inventory and item use

Definitions use the seven stable categories (`keys`, `potions`, `revision`,
`quest-items`, `relic-fragments`, `xp-items`, and `special-rewards`) and five
rarities (`common`, `rare`, `epic`, `legendary`, `mythic`). Every catalog item
has a stable ID and original art-variant key. Acquisitions are quantity-bearing
receipts with source, timestamp and idempotency key; acquisitions increment
owned stock exactly once per source/item key.

XP Crystal consumes one item for 25 XP. The fictional Life Potion adds 60
seconds to an active attempt, Revision Token adds 30 seconds (60 with Revision
Relic), and Gate Key adds 120 seconds. These three are limited to one use of
each item ID per attempt; Gate Keys are never an entry requirement. These are
game mechanics only, not medical claims. Coins, fragments, quest items, and
equipment are inspectable/nonconsumable. Opening a Reward Chest consumes one
and atomically grants a deterministic set: Mythic Achievement Relic x1,
Legendary Quest Lens x1, XP Crystal x2, Relic Fragment x3, and Life Potion x1.
There are no purchase, gambling, or random-reward mechanics.

## Equipment effects

Equipment ownership is required; slot compatibility is validated and
replacement does not remove ownership. Re-equipping the same item is a no-op.
Scholar Core adds +5% NCERT quest XP; Calculation Gauntlet adds +5% calculation
quest XP; Quest Lens adds +2% daily quest XP; Focus Crystal adds +3% Gate XP
(it does **not** create Focus XP); Revision Relic doubles Revision Token time;
Sentinel Sigil gives Boss attempts +60 seconds at entry; Achievement Relic adds
+2% Gate XP. Combined XP bonuses are capped at 10%, rounded down. Equipment
bonuses apply only to newly observed positive canonical quest completions.
Each bonus event records quest ID/date/source XP key; a subsequent canonical
quest reversal subtracts that recorded bonus rather than recalculating from the
current loadout, preventing equip/unequip toggling from farming XP. The existing
base daily-quest award is not changed.

## Normalization and integration notes

`normalizeRpgState` tolerates absent, partial, unknown, or malformed sibling
fields, salvages valid inventory/event/attempt records, and retains original
malformed data in `malformedRaw`. It recomputes effects from owned, valid loadout
items. An absent legacy RPG field becomes empty inventory/loadout/history;
eligibility flags may reflect the user's real XP, but no historical gate
completion, item, or reward is fabricated. Corrupt data is never repaired by
replaying claimed rewards.

Use the caller-supplied `ProgressHistoryTicket` for every command/transition.
Stable command, attempt, activity, clear, reward, and receipt keys make reducer
re-evaluation and reload replay-safe. The advance hook detects newly added
canonical lecture/NCERT/calculation/Boss records directly from the supplied
before/after snapshots, as well as newly captured progress-history events, and
deduplicates the two sources. This allows it to run before or after history
capture without accepting pre-existing/imported activity. The provider mirrors
returned RPG XP events into the main XP/progress-history accounting atomically.

## Scope and limitations

This module implements domain state and reward logic only; it does not render
the blueprint's gate/inventory/loadout screens or animations. Boss challenge
events rely on the existing canonical `boss.activity` record IDs and metadata;
the existing weekly one-record-per-batch rule is intentionally left unchanged,
so a cleared Boss gate cannot be farmed by overwriting/reusing that record.