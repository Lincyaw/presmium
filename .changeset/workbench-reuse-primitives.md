---
"@presmium/workbench": patch
"@presmium/dsh": patch
"@presmium/web": patch
---

Reuse Radix UI controls, cmdk command search, React Arborist file trees and react-resizable-panels for the workbench's generic interactions. Reuse Harness's onboarding modal while preserving Presmium's document, source editing and preview behavior.

Create workspace preview directories before resolving the dev server's filesystem allow list, and pass canonical roots to VitePress, so previews also work beneath symlinked cache paths such as macOS /var.
