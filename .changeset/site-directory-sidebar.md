---
'@lincyaw/web': patch
'@lincyaw/viewer': patch
---

`site.sidebar: directories` arranges a workspace site's sidebar as the tree of its folders: a folder's own document is the parent of the documents inside it, a folder without one is labelled by its name, the folders on the way to the current document are open, and the pager and the documents list follow the same order; `site.sidebar: { by: directories, order: [...] }` puts the folders it names first among their siblings. The documents list no longer grows wider than the page when there are many tags or a deep folder; task lists show their checkboxes without bullets; a Mermaid diagram wider than the column is scaled to fit it; code blocks have an outline, so they stand out when the code theme's background matches the page; and the small-screen navigation drawer is titled "Navigation".
