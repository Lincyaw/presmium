---
"@lincyaw/workbench": minor
---

Keep canonical document editing independent of runtime compilation. Subscribe to IR only during presentation, follow export jobs only while requested, and keep those optional streams mutually exclusive so HTTP/1 document saves retain a connection.

Remove preview-to-Markdown writers, native text lenses, old script/voice panels and the custom selection comment layer. The parent BlockNote editor and versioned document session own editing, comments and history. Reject obsolete preview write requests explicitly. Remove automatic preview compilation on document-list hover or startup, and wait for the requested view acknowledgement before accepting initial iframe positions.
