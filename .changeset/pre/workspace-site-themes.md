---
'@lincyaw/web': minor
'create-presmium': patch
---

Sites take a theme of their own: `site.theme` names a theme directory or an installed theme package whose `theme.json` extends a built-in theme and sets its parameters, design tokens for the light and dark appearance, web fonts and stylesheets. Pages link the published theme files and carry `data-pm-site-theme-name`; HTML template homepages receive the stylesheets in the site data.
