---
'@lincyaw/web': patch
---

Keep document bundle caches valid through symlinked paths, excluding temporary build inputs. Rebuilding unchanged code no longer reloads the preview and interrupts pending body edits.
