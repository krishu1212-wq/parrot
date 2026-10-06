---
name: Manifest-derived Expo bundle URLs
description: Avoid false Metro entry errors when probing Android through Replit's path-based Expo preview.
---

On Replit's path-based Expo preview, the development manifest can return a `launchAsset.url` with the artifact route prefix. Hand-built root bundle paths can return `UnableToResolveError` even while the manifest-selected Android bundle works.

**Why:** The preview's public bundle route is scoped to the artifact path; omitting that prefix asks Metro to resolve a different entry point.

**How to apply:** Request the development manifest with `Accept: application/expo+json` and `expo-platform: android`, then probe its exact `launchAsset.url`. A successful request from the workspace verifies public routing and bundling, not that the Android emulator connected or executed the app.