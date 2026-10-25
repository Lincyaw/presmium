# Code references and execution

First find out what the reader needs: a passage of real code from a repository, a fixed result computed at build time, or an example they can change and run. Reuse the execution setup the document already has (the `execute` key of the frontmatter and the plugins it lists); do not add a remote environment for a simple example.

Every plugin named here works only when its package is listed under `plugins` in the document's frontmatter.

## Referencing real code

List `@lincyaw/addon-code` and use `{code-ref}` with an anchor:

````md
```{code-ref} region:src/bpe.py#merge
:pin: dd64ade
```
````

Anchor paths start at the root of the git repository that contains the document; only when the document is not in a git repository do they start at the document folder.

- `region:src/bpe.py#merge`: the code between the comments `# #region merge` and `# #endregion merge` in that file (any VS Code folding-region comment works, such as `// #region merge`).
- `symbol:src/bpe.py#Tokenizer.encode`: a declaration found by name, with no markers (TypeScript, JavaScript and Python).
- `:pin: <commit>` fixes the version being explained; the commit must exist in that same repository. Without `:pin:` the working tree is read.

The full syntax, step-by-step highlighting (`:steps:`) and version comparison (`:variants:`) are under `{code-ref}` in the [directive reference](directives.md).

When an anchor is reported missing, check the file and the region first; when it is reported ambiguous, check that the matched candidate is the right one. Once confirmed, run `presmium check --update-lock` to record the new locations in `.presmium/anchors.lock.json`. When the working tree has drifted from the pinned commit (the warning shows the diff), read the diff, then decide whether to move `:pin:` or keep the old version.

## Choosing when code runs

List `@lincyaw/addon-exec`. Give a `{code}` directive the option `:run:`: `compile` runs it at build time and shows the recorded output, `live` lets the reader run it with a click, `both` does both; a bare `:run:` means `compile`. A plain ```` ``` ```` fence takes no options, so write ```` ```{code} ````:

````md
```{code} python
:run: both
print(sum([1, 2, 3]))
```
````

The web page and the slides show a run button for live code. Live code with no step highlighting and no versions can also be edited in place before running (**Edit the code**; Mod-Enter runs; **Restore the code** goes back to the original). For an example with parameters the reader changes, use `{run-panel}`; to explain how a program runs line by line, use `{step-run}`. Their syntax is in the [directive reference](directives.md).

In the browser, Python runs on Pyodide, whose built-in runtime has only the standard library. For examples that need numpy, matplotlib and the like, prefer build-time output (`:run: compile`), or pick an environment that has them (see "Named environments" below). C, C++, Ruby and SQL can run in the browser with `@lincyaw/addon-exec-wasi`; its runtime adds to the size of the published site. Configure GPUs and remote kernels only when the task needs them.

## Sharing variables between blocks

For "train first, then encode", give the related blocks the same `:session: <name>`; they then share one interpreter. These blocks must use the same environment; changing an earlier block records the rest of the session again. In the browser they must be run in order, and **Reset session** clears the interpreter.

Do not put independent examples in a session. A file written by one run must not be a precondition of another, independent run.

## Named environments

Declare environments under `execute.environments` in the frontmatter, select one on a code block with `:env: <name>`, and set the default with `execute.env`. For example, a Jupyter server (plugin `@lincyaw/addon-exec-jupyter`):

```yaml
execute:
  environments:
    lab: { kind: jupyter, auth: proxy, kernel: python3 }
```

When the selected environment is unavailable, Presmium does not switch to another one: it shows the recorded output if there is one.

The kinds of environments, the plugins that provide them and their options are in the [directive reference](directives.md): `{local-env}` (a devcontainer on this machine), "Remote environments" (Jupyter servers), `{terminal}` and the code directives. Put credentials in environment variables, such as `PRESMIUM_ENV_<NAME>_TOKEN`, never in the document, which is published. Verify the real connection with `presmium check --env`.

## When the output is wrong

`presmium check`, `ir`, `build` and `dev` all compile the document; compiling may run code and update the recordings in `.presmium/freeze/`. When the code has not changed, its recording is reused; with no runtime available, the existing recording is still used. A recording made in another environment is reused with a warning; set `execute: { rerun: environment }` in the frontmatter only when it really must run again.

First tell apart three cases: a stale recording, a failed run and an unavailable environment. Check the code, the parameters, the session order and the diagnostics; do not start by deleting the recordings. For a timeout, change the example first, and raise `:timeout:` (milliseconds) if needed.

Rich output can show figures, tables and more; `:echo: false` shows only the output, not the code. Code that belongs to a component is run by that component and gets no separate run controls. When a `{run-panel}` fails, it shows the prerecorded output given in its `:recorded:` option.

Before delivering, check the results in each form you deliver, and make sure no local paths, environment variables or teacher content ended up in the output. The recordings others need to reproduce the results are listed in [Publishing and reproduction](publishing.md).
