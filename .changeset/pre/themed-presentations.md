---
'@lincyaw/workspace': patch
'@lincyaw/web': patch
---

A workspace site's presentations wear the site's theme (its tokens, fonts and stylesheets), and every page built with a workspace theme carries `data-pm-site-theme-name` on its body, so the theme's tokens reach pages that do not draw the site's shell.
