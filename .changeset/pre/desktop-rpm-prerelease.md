---
"@lincyaw/presmium": patch
---

Package Linux prereleases with a native RPM version and release while preserving the complete application and updater version in the already-built binary. Keep DEB as the default Linux build and sign the final RPM bytes with the complete version. Use the public Tauri signing API so update collection works independently of package-manager environment variables, verify signatures without rebuilding the desktop application, pin CI sources, and publish prepared release drafts only after all platform packages pass verification.
