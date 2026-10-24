---
'@lincyaw/kernel': minor
'@lincyaw/host': minor
'@lincyaw/viewer': patch
'@lincyaw/web': patch
'@lincyaw/workspace': patch
'@lincyaw/workbench': patch
'@lincyaw/dsh': patch
'@lincyaw/addon-content': patch
'@lincyaw/addon-core': patch
---

Reuse up to two loaded web preview windows when switching lectures. Inactive previews unmount document components, stop their runtime and control stream, and expire after two minutes. Resume refreshes the published IR without reloading JavaScript. Unsupported previews, changed runtime configurations, and plugins without an explicit restartable lifecycle fall back to reloading.

Add optional preview activity commands and acknowledgements. Browser module packages must opt in with `presmium.preview.restartable` and kernel plugins with `PluginDefinition.restartable`, promising complete disposal followed by setup in the same window. Core and content opt in; other sources default to reloading.

Validate unchanged IR snapshots with ETags and reuse a bounded cache of parsed workbench IR, avoiding repeated transfers and parsing while still checking the current revision on each request.

Coalesce concurrent IR reads, revalidate saves that arrive during an earlier read, and memoize pure Markdown HAST within a bounded cache. Mounted components and background resources are never retained by this data cache.
