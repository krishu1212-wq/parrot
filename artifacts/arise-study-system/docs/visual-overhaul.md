# ARISE visual/UX overhaul

This pass changes presentation only. StudyContext, progression/rank rules,
Gate evidence, reward receipts, inventory quantities, equipment effects, storage,
account ownership, academic records, and official weekly Boss eligibility remain
the established sources of truth.

## Original artwork and composition

Four original images were generated for ARISE from the user's written direction:
System Core sanctum, faceted Guardian, dimensional Gate, and relic vault.
No reference image files were uploaded, so this pass does not claim to match or
reproduce unseen references. The images contain no copied screenshots, logos,
named anime characters, or imported franchise artwork.

Optimized local JPEGs are bundled under `assets/images`; the four files total
approximately 604 KB. `WorldArtwork` supplies cinematic environments and fades;
native SVG supplies original emblems, Guardian crests, rank crowns, faceted
items, portal geometry, and attachment markers.

Major screens combine environment, large artwork, and readable foreground HUD.
`HudFrame` is a scalable cut-corner metal frame. Existing `GlassPanel` consumers
use this visual frame without changing their public API.

## Contextual identities

- System / Maths: cyan, electric blue, silver.
- Status / ranks: rank-specific crowns with violet, silver, and gold framing.
- NCERT / vocabulary: violet and magenta.
- Reasoning / English: indigo and teal.
- Gates: distinct cyan, violet, gold, and crimson portal variants.
- Boss / recovery / weakness: crimson and orange against dark environments.
- Inventory / rewards: black metal, warm vault light, and rarity-colored slots.
- Common, Rare, Epic, Legendary, Mythic: silver, blue, purple, gold, crimson.

## Events and safety

Level Up presents the actual earned level. Rank Ascension receives the actual
previous rank from the Home observer, fractures that emblem, and reveals the
new one. Ascension waits while Level Up is visible so its animation does not
finish behind another modal. Both milestones also wait until the persisted RPG
presentation queue has been acknowledged, rather than animating invisibly
behind a Gate or item reveal.

The global RPG queue still owns Gate, item, and chest presentation. Chest
opening is a local visual timeline only: the persisted domain already granted
its deterministic contents. Animation never awards XP, changes quantities, or
replays a receipt. Only the existing Continue action acknowledges the event.
Equip/unequip retain the existing lightweight System notification ownership.

Reduced motion shows final readable states, no rotating rings, flashes, or
particle animation. Decoration is pointer-transparent. Interfaces retain safe
areas and explicit touch targets. No new animation package, sound system, or
paid/random reward mechanism is introduced.

The Life Potion is a fictional in-app time-extension item, not medicine or a
physical reward.