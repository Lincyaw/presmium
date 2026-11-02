---
"@lincyaw/mcp": patch
"@lincyaw/dsh": patch
---

Presmium Studio's AI assistant sees the pictures `capture_slides` takes. A Presmium tool's images reach the model as images of its tool result, stored in DeepSeek Harness's attachments, when the model of the session's latest request takes images; with a text-only model it gets the text with the pictures' files and a line saying the images were not attached, and the call still succeeds. `connectPresmiumMcp`'s call result carries the images beside the text (`images`).
