---
'@lincyaw/cli': patch
---

`presmium import <notes> --out <dir>` turns a folder of Markdown notes into documents, one `lecture.json` per note: frontmatter gives the title, description, tags and language; a page opens at each level-1 and level-2 heading; `[[note]]` and `[[note|text]]` wikilinks find their document by file name or alias; math, tables, task lists, Mermaid diagrams, images, callouts and footnotes come across; linked local files are copied into the document's `attachments/`; `--exclude` leaves folders such as `raw` out, and `--group` makes a folder the first tag by which the site's sidebar groups documents.
