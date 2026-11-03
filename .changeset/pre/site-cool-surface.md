---
"@lincyaw/design": patch
"@lincyaw/host": patch
"@lincyaw/web": patch
"@lincyaw/skills": patch
"create-presmium": patch
---

The built-in website themes take the AegisLab look: a cool light grey page (near-black in dark mode) under a faint ambient wash, a translucent header that lines up with the page's columns and marks the current navigation item, Hanken Grotesk for the interface and sans text, and pill-shaped buttons, search fields and segmented choices (`data-shape="pill"`, a new shape beside the densities). `docs` and `course` now default to the `blue` accent (the AegisLab blue) and `sans` typography, and `presmium new --type site` writes these; a site that names `accent` or `typography` keeps its choice. The home and landing pages are centred as blog and documentation front pages are, with cards of equal widths centred as a group; a JSON homepage without `hero` has no hero and starts at its first section. The author skill gains a guide to writing the homepage and to keeping `site.nav` to site-wide destinations rather than one entry per document; `presmium new --type site` follows it, writing a homepage that lists the documents and no navigation entry. Beside the outline on wide screens, the left column no longer repeats the sections of a document without chapters, and a site of that one document drops the left column. Scrolling sections, a figure beside its steps, spread to the room between the columns (at most 75rem) while prose keeps its measure. A link or an address to a section lands with its title clear of the header (and of the bar under it on a phone), also when the page is drawn after it loads. The workbench keeps its warm reading surface.
