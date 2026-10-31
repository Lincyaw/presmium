---
'@lincyaw/addon-lecture': patch
---

A lecture loads each audio file once, however many clips are cut from it (a score split per step was fetched once per clip), and `presmium serve` lets the browser keep media and revalidate it by its tag (`ETag`, 304) instead of `no-store`.
