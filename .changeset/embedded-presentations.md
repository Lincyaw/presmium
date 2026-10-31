---
'@lincyaw/kernel': patch
'@lincyaw/host': patch
'@lincyaw/design': patch
'@lincyaw/viewer': patch
'@lincyaw/web': patch
'@lincyaw/workspace': patch
'@lincyaw/addon-lecture': patch
'@lincyaw/addon-motion': patch
'@lincyaw/presmium': patch
---

A site's template homepage can play its presentations well. A presentation in a frame tells the embedding page when its scene is drawn and what its lecture is doing (`presmium:state` messages), and `@lincyaw/presmium/site` gives templates `prefetchPresentation` and `whenPresentationReady`; the site data lists each document's presentation (`slides`), also under `presmium serve` before a document is compiled; the theme's stylesheets are linked in the template's head. Where a browser refuses to autoplay, the large Play button is the design system's `PmIconButton variant="overlay"`.

Images are encoded as WebP where they are published (document media, and images scenes and templates import), cached by their content in `.presmium/images/`, before the offline service worker lists the files; nothing is renamed afterwards. A presentation preloads what Vite's build records its scenes and plugins load. A site's presentations name the site's viewer app directly (`appBase`). `presmium serve` answers a lecture's audio with 304 from the file's known hash without reading it, and streams it with byte ranges otherwise. The stale-deploy reload waits until the page is online and reloads at most once in 30 seconds.
