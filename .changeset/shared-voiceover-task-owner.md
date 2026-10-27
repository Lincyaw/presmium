---
"@lincyaw/kernel": minor
"@lincyaw/addon-lecture": minor
"@lincyaw/workspace": minor
"@lincyaw/mcp": minor
"@lincyaw/dsh": patch
---

Share one voiceover intent and task owner between Workspace HTTP and MCP. Add source/IR-bound status, process-local job discovery, idempotent starts, monotonic task sequence and cancellation that remains readable without compiling or loading providers. Compiled remounts borrow the Workspace owner; standalone Web servers use the same coordinator and close their own work.

Expose real voice audition through an expiring quote and bounded binary audio resources instead of putting data URIs in MCP text. Track auditions during shutdown. Stop advertising the synchronous lecture_synthesize plugin tool; use the shared Workspace start_voiceover task API. The existing presmium-lecture export CLI remains unchanged.
