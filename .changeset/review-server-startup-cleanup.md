---
"@lincyaw/server": patch
---

Release the HTTP listener and server resources when startup cannot write its state file or bind its port. Closing the server also disconnects upgraded WebSocket clients and reuses one cleanup operation.
