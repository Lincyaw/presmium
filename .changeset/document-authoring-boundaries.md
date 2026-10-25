---
"@lincyaw/kernel": minor
"@lincyaw/host": minor
"@lincyaw/design": minor
"@lincyaw/viewer": patch
"@lincyaw/web": patch
"@lincyaw/workbench": patch
"@lincyaw/dsh": patch
"@lincyaw/addon-lecture": patch
---

Keep document authoring independent from presentation and video controls, with every chapter visible in one continuous authoring canvas. Restore ordinary BlockNote paragraph, list and formatting edits; make toolbar undo use the editor's own history before saved source revisions, retain stable page identities during native title edits, and preserve confirmed source bindings when restoring deleted simple blocks. Keep newer input explicit across delayed save acknowledgements and return completed writes only to their original preview instance. Retain drafts while a preview is inactive and do not replay request replies after a new handshake.

Keep author tools within desktop and touch viewports, avoid covering selections with formatting or comment tools, expose only formatting that survives Markdown persistence, preserve source text when showing comment pins, and allow only clipboard writing for explicitly requested draft copies. Refresh document context after author operations so newly created documents can be selected immediately. The separate compilation and video workspaces remain subsequent work.
