# Editable document format

`lecture.json` is Presmium's versioned domain document, not an editor's private state. The installed `@lincyaw/kernel` exports `DOCUMENT_ENTRY`, `DOCUMENT_SCHEMA_VERSION`, `DOCUMENT_JSON_SCHEMA`, `validateDocument` and the TypeScript `TeachingDocument` contract. Use that contract and validator for exact fields.

A document has `schemaVersion`, `id`, `metadata`, `sectionOrder`, `sections`, `blocks`, `steps`, `narrations`, `assets`, `definitions` and `production`. Metadata includes title/language and optional plugins, renderer settings, execution, checks and translations. Credentials belong in operator settings, never metadata.

Sections contain a title, ordered child block IDs, ordered step IDs and a layout (`stack`, `columns`, `canvas` or `scrolly`). Blocks are typed `text`, `container`, `image`, `code` or `component`. Containers own child IDs; component instances reference a definition plus their own parameters; image blocks reference an asset.

Text blocks contain structured `paragraph`, `heading`, `list`, `blockquote`, `code`, `math` and `table` nodes. Actual editing units and list/table children retain IDs. Inline content is `text` with marks, `link`, `math` or `break`; rich text is adapted through BlockNote's public API. Do not put Markdown source in a string field to imitate this model.

A step belongs to one section and has `visuals` and `narrationIds`; optional `inherits` refers to an earlier authored state. Omitted blocks are invisible. `visuals` explicitly name block visibility, a declared component state and optional state parameters. Arbitrary step selection must reconstruct the same state without playing earlier steps.

Narrations are structured `text`, `pronunciation { display, spoken }` and `cue { id, action, target?, parameters? }` nodes. The target uses stable `blockId` and optional component element. Captions, spoken text and cue alignment derive from this one structure.

`production.defaults`, optional section overrides and `stepOverrides` own narration start, minimum hold, trailing pause and voice source. Voice sources are `none`, TTS with an actual provider voice, or a recording asset. Cue delays live in `production.cueTimings`. Media clips reference source time ranges and a step attachment. Absolute playback times are generated, never copied back from a snapshot.

Definitions retain implementation references (`file`, `module` or `plugin`), parameter Schema, declared states and versioned plugin data. A migrated numeric state has an explicit `legacyIndex`; a number is not a semantic state name. Assets keep a location and optional fingerprint/media type, with large files outside JSON.

Validate references, unique IDs, tree ownership, parameter/state capability and media ranges before saving. Agent and Web edits enter the same transaction validation with `baseDocumentVersion`; runtime output uses a separate snapshot identity. Old replies must not clear new edits.
