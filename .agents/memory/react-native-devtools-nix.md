---
name: React Native DevTools Nix dependencies
description: Diagnose missing shared libraries for the Linux React Native DevTools executable in a Replit Expo workflow.
---

On Replit, use the package-management system dependency installer to add Nixpkgs attributes; it records them in the workspace's `.replit` Nix package list. Do not create a `replit.nix` just because generic documentation mentions it. When the prebuilt DotSlash DevTools launcher reports a missing `.so`, inspect the cached Linux ELF with `ldd` and install the Nix packages for its unresolved libraries. Some runtime libraries are separate attributes: in the stable 25.05 channel, `libgbm` was separate even when `mesa` was present.

**Why:** Expo startup exposed one missing shared library at a time; adding only GLib changed the error to another missing library. Expo Doctor does not validate this prebuilt native DevTools runtime.

**How to apply:** For the same error class, diagnose the Linux executable's actual dynamic dependencies, add only their Nix packages, restart the Expo workflow, and verify that the DevTools installation error no longer appears. Keep this separate from app-code and study-data changes.