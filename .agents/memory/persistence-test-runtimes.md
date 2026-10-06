---
name: Persistence test runtimes
description: Match module-cache lifetime to the persistence concurrency scenario being tested.
---

Provider remounts within one app must be tested with one shared module graph and storage boundary. Separate module graphs represent separate app instances, not an ordinary remount.

**Why:** The storage ownership and write queues are module singletons. Isolated test loaders allowed a new provider to read and edit while an older provider's queued writes were pending, an interleaving the shared app runtime fences. Such tests cannot establish a same-runtime production remount defect.

**How to apply:** Explicitly distinguish shared-runtime remount tests from isolated-instance concurrency tests. Neither proves cross-tab or cross-process coordination beyond the existing in-process architecture.