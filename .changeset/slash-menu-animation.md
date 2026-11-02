---
'@lincyaw/workbench': patch
'@lincyaw/dsh': patch
---

The document editor's slash menu has Insert Animation with AI…, beside Picture. It inserts nothing: it points the AI's focus at the block the menu was opened in, opens the AI Assistant and puts a request naming the place (the page, and after which paragraph or at its end) in its input box, with the caret at the end, for the author to say what the animation should show and send. Without a model the draft waits beneath the Set Up a Model notice. The workbench offers this through `onAgentDraft`, which the Studio client implements on the current chat's input box; text the author had already written there is kept above the draft.
