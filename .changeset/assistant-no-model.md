---
'@lincyaw/dsh': patch
---

The AI assistant without a usable model no longer starts a turn that is bound to fail.

- When Harness's model catalog has no routable provider, the composer is replaced by "The AI assistant needs a model" with one action, Set up a model, which opens Settings → Models (the welcome notice's path). The typed draft stays beneath the notice and is there again once a model is set up. Comments and Fix with AI are not sent either; the assistant is shown with the same notice.
- A failed turn reads in the author's terms, by its failure code: a missing model or key, a key the service rejected, a used-up quota (each with an action that opens Models), a busy service, a chat too long, or a generic failure. The provider's message and code stay under Technical details.
- Choosing Harness's own English or 中文 in Settings switches to English (Presmium) or 简体中文（Presmium）, so the AI panel keeps the workbench's copy.
