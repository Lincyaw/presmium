# Code references and execution

First find out what the reader needs: a passage of real code from a repository, a fixed result computed at build time, or an example they can change and run. Reuse the lecture's existing environment setup; do not add a backend for a simple example.

## Referencing real code

List `@lincyaw/addon-code` and use `{code-ref}`. Anchor paths start at the root of the git repository that contains the lecture; only when the lecture is not in git do they start at the lecture directory.

- A region marked by hand: `region:src/bpe.py#merge`.
- A declaration: `symbol:src/bpe.py#Tokenizer.encode`.
- To fix the version being explained, add `:pin: <commit>`; otherwise the working tree is read.

The full syntax, step-by-step highlighting and version comparison are under `{code-ref}` in the [directive reference](directives.md). A pinned commit must exist in that same repository.

When an anchor is "missing", check the file and the region first; when it is "ambiguous", check that the candidate is the right one. Once confirmed, update the lock file with `presmium check --update-lock`. When the working tree has drifted from the pinned version, read the diff, then decide whether to update `:pin:` or keep the old version.

## Choosing when code runs

List `@lincyaw/addon-exec`. On a code block, `:run: compile` runs it at build time, `:run: live` lets the reader run it with a click, `:run: both` does both; a bare `:run:` means build time.

````md
```{code} python
:run: both
print(sum([1, 2, 3]))
```
````

Web pages and slides show a run button for live code. Live code with no step highlighting and no versions can also be edited in place before running (**Edit the code**, Mod-Enter runs, **Restore the code** goes back to the original). A run panel suits examples with parameters; stepped execution suits explaining how a program runs. Their syntax is in the [directive reference](directives.md).

Python in the browser runs on Pyodide, and the built-in runtime has only the standard library; for examples that need numpy, matplotlib and the like, prefer build-time output or pick a suitable remote environment. C, C++, Ruby and SQL can use `@lincyaw/addon-exec-wasi`, whose runtime adds to the size of the published site. Configure GPUs and remote kernels only when the task needs them.

## Sharing variables between blocks

For "train first, then encode", give the related blocks the same `:session:`. These blocks must use the same environment; changing an earlier block re-records the rest of the session. In the browser they must be run in order, and **Reset session** clears the interpreter.

Do not put independent examples in a session. A file written by one run must not be a precondition of another independent run.

## Named environments

Declare environments under `execute.environments` in the frontmatter and select one on a code block with `:env: <name>`; `execute.env` sets the default. When the selected environment is unavailable, Presmium does not switch to another executor: it shows the recording if there is one.

Environment configuration, the plugins that provide them and examples are under `{local-env}`, `{terminal}`, "Remote environments" and the code directives in the [directive reference](directives.md). Put credentials in environment variables, such as `PRESMIUM_ENV_<NAME>_TOKEN`, never in the lecture. Verify the real connection with `presmium check --env`.

## When the output is wrong

Compilation happens in `check`, `ir`, `build` and `dev`, and may run code and update `.presmium/freeze/`. When the code has not changed, the recording is reused; with no runtime available, the existing recording is still used. By default a recording from another environment is reused with a warning; set `execute: { rerun: environment }` only when a rerun is really needed.

First tell apart "stale recording", "execution failed" and "environment unavailable". Check the code, the parameters, the session order and the diagnostics; do not start by deleting the cache. For timeouts, change the example first, and adjust `:timeout:` if needed.

Rich output can show figures, tables and more; `:echo: false` shows only the output. Code owned by a component is run by that component and gets no separate run controls. When a run panel fails, it can show the prerecorded output from `:recorded:`.

Before delivering, check the results in the target medium and make sure no local paths, environment variables or teacher content ended up in the output. The recordings needed for reproduction are listed in [Publishing and reproduction](publishing.md).
