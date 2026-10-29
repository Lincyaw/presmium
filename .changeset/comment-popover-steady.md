---
"@lincyaw/workbench": patch
---

A comment's card in the document no longer opens while the pointer is still pressed and then vanishes when the press turns into a text selection: the guard that keeps it off a selection in progress reads the editor's current view, so a card opens after the click, never during a drag, and a card already on screen stays put when its text is clicked again. The card and the new-comment form keep a margin from the screen edge on narrow screens, as the other popovers do.
