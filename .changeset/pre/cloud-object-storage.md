---
"@lincyaw/presmium": patch
---

The cloud deployment stores shares in the Versity S3 Gateway instead of MinIO, whose images are no longer published; upgrades copy existing shares over. The installer pulls only published images unless asked to build, and downloads quietly.
