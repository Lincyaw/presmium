---
"@lincyaw/mcp": minor
"@lincyaw/cli": minor
"@lincyaw/presmium": minor
"@lincyaw/server": patch
"@lincyaw/workspace": minor
"@lincyaw/kernel": minor
"@lincyaw/web": minor
"@lincyaw/host": minor
"@lincyaw/skills": minor
"create-presmium": minor
---

AI tools connect to Presmium with one command. `presmium mcp` serves MCP on stdio and relays to the Presmium Studio or `presmium serve` running for the project, reading their port and access token from the state file again whenever they start anew; with neither running it compiles the document itself. A new project has a `.mcp.json` for Claude Code and starts with a first commit, and its README and AGENTS.md say how to connect. On connecting, the server's instructions give the order of work with the tools that host offers.

`capture_slides` takes pictures of a page's steps as the presentation shows them, as PNG images: each step's rest frame, moments into its animation (`at`), and the boxes of elements a CSS selector `measure`s. With `arrive: 'backward'` each step is reached from the step after it, as a presenter going back does. `capture_reading` takes a page of the reading version at a window width, and `capture_overview` every page at once, as a directory of frames in reading order and sheets of labelled thumbnails. The workspace service draws them in a headless browser through the viewer's capture hook, which drives the step clock exclusively (`StepClockDriver.exclusive`), so a picture is the same however often it is taken.

A write that needs the author's approval fails at once with `approval-unavailable` when no Presmium window is open to ask, instead of waiting and reporting a refusal; `presmium serve --allow` allows kinds without asking, as `presmium dev --allow` does. `plan_document_change` and `apply_document_change` no longer return the whole document. A document whose code can't be bundled reports why as a `presmium.preview.code` diagnostic. Servers remove their state file when they stop. A preview in the workbench posts its messages only to the workbench's own origin, without a console warning for each other allowed origin. `presmium skills install --update` replaces skills an earlier Presmium installed.
