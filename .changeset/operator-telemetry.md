---
'@lincyaw/dsh': patch
'@lincyaw/workbench': patch
---

Telemetry for the operator's own analysis, off unless `PRESMIUM_TELEMETRY_URL` names an OTLP/HTTP logs endpoint (with `PRESMIUM_TELEMETRY_HEADERS` and an optional `PRESMIUM_TELEMETRY_USER`).

- `@lincyaw/dsh`: the `presmium-telemetry` row exports every event of every session, whole, as `session-log` records through DeepSeek Harness's `otel` service, with the turn, the document and the workspace; `/api/presmium/telemetry` takes the workbench's operations and exports them as `presmium.workbench.<operation>` events. Resources carry `service.name=presmium-studio`, an installation id and the optional `user.id`.
- `@lincyaw/workbench`: `OperationLog` records the author's operations in order (documents, views and modes, pointing, in-place edits with their text, comments, requests to the AI, undo and review, the position in the document, the AI's changes shown, and clicks on the page's controls), sends them in batches and with `sendBeacon` when the page goes away. A request handed to the AI records the session's and the request's ids (`AgentAnswer`, which `onAgentRequest`'s handlers now return), joining it to the turn it started.
