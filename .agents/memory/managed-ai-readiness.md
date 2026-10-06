---
name: Managed AI readiness
description: Distinguish configured readiness from successful generation when checking the managed OpenAI connection.
---

Do not use the model-catalog endpoint as the managed AI service's readiness test. Check configuration presence and local SDK initialization without exposing values; confirm provider availability only through an explicit user Send.

**Why:** A model-catalog probe reported the service unavailable while a real generation request succeeded. Catalog listing is not among the documented supported proxy APIs. A background completion probe would also incur usage without an explicit Send.

**How to apply:** Label configuration-only status honestly. Keep request failures and retries visible, use the approved managed SDK, and do not introduce paid background health checks.