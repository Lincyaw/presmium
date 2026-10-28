---
'@lincyaw/design': patch
'@lincyaw/kernel': patch
'@lincyaw/addon-publish': patch
---

Text background colours are clearly visible in dark mode. The dark values of `accent-soft`, `ok-soft`, `warn-soft` and `danger-soft` are lifted off the page, and the grey background uses a new token `muted-soft` instead of `sunk`, so the page insets keep their look. Body text on every background stays above 8:1 and each semantic colour on its own background above 4.5:1; light mode is unchanged. Documents that saved the grey background as `sunk` show it as `muted-soft` in the editor and the published pages without being rewritten.
