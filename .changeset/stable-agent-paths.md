---
"@lincyaw/dsh": patch
"@lincyaw/workspace": patch
"@lincyaw/compiler": patch
---

Keep Linux and Windows agent directories stable across isolated view changes and parent/child handoffs. Preserve exact native authorization identities, refresh rejected or restored candidates, and copy Windows installed dependencies without directory links or shared source files. Source guards and reviewed publication remain in force. Validate Windows execution homes with native ACLs instead of Unix mode bits.

End owned Windows service descendants with native job objects when their watchdog or parent pipe closes.
