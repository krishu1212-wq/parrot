---
name: Expo native-preview capture
description: Distinguish Android bundle requests from actual access to the native screen.
---

An Android `Bundled` log proves that an Expo client requested JavaScript, not that the agent can view its rendered screen. The app preview screenshot path for Expo can open a separate web session, which may stop at authentication; a hosted Android emulator may also be absent from local ADB.

**Why:** In this project, a signed-in native screen was not available to the agent's screenshot browser even when Metro logged Android bundle requests.

**How to apply:** Use a fresh screenshot from the user's Android preview to inspect native UI. Do not claim native visual verification from a web capture or bundle log, and do not bypass authentication to reach the screen.