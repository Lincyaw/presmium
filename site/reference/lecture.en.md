---
title: Interfaces and versions
lang: en
description: Which interfaces stay stable under semantic versioning, and the version rules of the packages, the IR and the plugin contract
translationOf: { entry: lecture.md, digest: 2b7794afb342504be83afa15caed21915921ba025d7b17662844b39ddb469e36 }
---

(reference)=
# Interfaces and versions

Presmium 1.x keeps its public interfaces stable under semantic versioning. This document says what each of its three version numbers covers, which interfaces are public and which are experimental. The signature of each declaration is in the API reference (API in the navigation bar, generated from the source by TypeDoc).

Presmium's stable product is the core (the MyST syntax and the IR, the compiler, the renderers, the CLI) and its outputs (web pages, slides, notebooks, lectures), none of which needs a model service. The workbench, `presmium studio`, is separate from the outputs and experimental.

(versions)=
# Version rules

(versions-numbers)=
## Three version numbers

| Version | In 1.0 | What it covers |
|---|---|---|
| The packages' version | `1.0.0` | Every public npm package, released together with the same version |
| `IR_VERSION` | `1` | The JSON format of the IR (`presmium ir`, and `ir.json` in the outputs) |
| `KERNEL_VERSION` | `1.0.0` | The plugin contract, against which a plugin's `kernel` range is matched |

(versions-packages)=
## The packages' version

- **Major**: an incompatible change of a public interface (removed, renamed, a changed signature or behavior), or a major bump of `IR_VERSION` or `KERNEL_VERSION`.
- **Minor**: compatible features, such as new directives, options, renderers and new optional fields of the contracts.
- **Patch**: bug fixes and documentation.

A public interface to be removed is marked `@deprecated` first and stays at least until the next major version. All public packages share one version: "Presmium 1.x" is 1.x of any public package.

(versions-ir)=
## IR_VERSION

Within one `IR_VERSION` only optional fields are added; removing or renaming a field, changing its type or meaning, or changing the rules of steps and section ids raises `IR_VERSION`, and is a major version of the packages. Programs that read `ir.json` check its `ir` field first.

(versions-kernel)=
## KERNEL_VERSION and plugins

`KERNEL_VERSION` is the version of the plugin contract, separate from the packages' version. Plugins write `kernel: '^1.0.0'` in their Node entry and in their browser manifest; a plugin whose range excludes the current version is not loaded, `presmium check` reports `presmium.plugins`, and the build does not crash. A compatible addition to the contract raises its minor version, an incompatible change its major version.

Plugins declare `@lincyaw/kernel`, `@lincyaw/host`, `@lincyaw/viewer` and `@lincyaw/compiler`, those they use, as peer dependencies `^1.0.0`, sharing the application's copy; when the installed Presmium does not satisfy them, the loader reports it the same way and leaves the plugin out. Such a plugin works with any Presmium 1.x.

(public)=
# Public interfaces

(public-documents)=
## Documents, the IR and commands

- The MyST source syntax: the headmatter's keys, sections and labels, narration and on-screen content, steps, the built-in directives, and the directives and inline roles of the official plugins.
- The IR (`IRDocument` and the other types of `@lincyaw/kernel`) and `IR_VERSION`; the layout and addresses of the outputs (`dist/ir.json`, `dist/<renderer>/`, page file names and section anchors, `?clicks=`, `?view=`).
- `presmium build | dev | ir | check | serve` with their options, exit codes, the format of findings and their check ids, and the structure of `presmium check --json`; the commands of the other packages (`presmium-mcp`, `presmium-export`, `presmium-diff`, `presmium-lecture`, `presmium-speech`, `presmium-language-server`, `presmium-classroom-server`); the MCP tools and resources.
- The workspace configuration file `presmium.workspace.yaml` with the operator's settings, and the operator's environment variables.

Native thread pools used by local previews, builds and code execution default to one thread; the libuv pool is capped at two threads. Operators can set `PRESMIUM_MAX_THREADS` to adjust the native thread budget, capped at half the available logical processors (one on a single-core machine). Smaller native thread settings are preserved. These soft limits leave capacity for other applications and do not replace container CPU or memory quotas.

The programming interface accepts `CompilerOptions.priority: 'interactive' | 'background'` (default: `background`). Top-level compilations in one host run serially, with interactive work preceding queued background work. `compiler.compile({ signal })` accepts an `AbortSignal` to cancel obsolete work at cooperative checkpoints. Global passes, dependency checks and the final IR remain complete.

(public-contracts)=
## The plugin contract

- `@lincyaw/kernel`: plugin definitions and manifests, the fields of the Node plugin `PresmiumNodePlugin`, `DirectiveSpec`, `RoleSpec`, `IRPass`, `Check`, `Finding`, `Renderer`, `RenderContext`, service tokens and their interfaces (the Node services included), server routes and agent tools, and the plain functions plugins share.
- `@lincyaw/host`: the composables components use (`useStepState`, `useService`, `useSharedState`, `useServer`, `useMessages` and others), the host's services (the `tools` and `settings` slots of `TOOLBAR`, `NAVIGATION`, `OPERATIONS`), and the design system's tokens and components.
- `@lincyaw/viewer`: the viewer plugin `ViewerPlugin` and what its context gives: the registration functions, `useViewer`, `SectionView` and `BlockView`.
- `@lincyaw/cli/testing`: `presmium` for plugins' integration tests.
- `@lincyaw/compiler`: the programming interface `Compiler`, `Compilation`, `build`, `dev` and the like.

The types that appear in the signatures of public interfaces are public with them. Any other name a package exports is internal, shared between Presmium's own packages, and may change in any version, even when the API reference shows it.

(experimental)=
# Experimental interfaces

(experimental-workbench)=
## The workbench

These interfaces are experimental: outside the 1.x promise, they may change in a minor version. Their TypeScript declarations carry the `@experimental` tag in the source, shown as Experimental in the API reference; for the user interfaces and routes, which have no declaration to tag, this list is what counts.

- the packages of the workbench, `presmium studio`: every export and interface of `@lincyaw/studio`, `@lincyaw/dsh` and `@lincyaw/workbench` (0.x);
- the routes the workspace service provides for the workbench (documents, files, source, changes, revisions and review);
- the contracts `Focus`, `FocusReport` and `McpIssueOptions`, and `useToolbarPlacement` and `provideToolbarPlacement` of `@lincyaw/host`.

The `presmium serve` command, the workspace configuration file and the Node services are public interfaces; reader questions (`ASK` and the Ask panel) are part of the outputs and public too. Plugins should not depend on experimental interfaces; one that does names exact versions in its peer dependencies.
