---
"@lincyaw/workbench": patch
"@lincyaw/design": patch
---

- A comment's card opens under the line that was clicked, starting where that line starts, instead of centred under the whole commented range; on a long or wrapped comment it no longer sits far below the text.
- The card has no blank row above the author: the native actions float at the end of the author line, which keeps room for them.
- Comments by the local author show the localized “作者 / Author” instead of the internal name “local author”, in the card and in the comments pane; a member's own name is still shown.
- A new comment on text after an inline formula or a line break in the same paragraph saves: native positions are converted to the document's text offsets (a formula counts as one character, a line break as one line break), where the formula's source used to shift them and the save was refused.
