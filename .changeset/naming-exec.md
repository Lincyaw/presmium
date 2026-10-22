---
'@lincyaw/kernel': patch
'@lincyaw/host': patch
'@lincyaw/slidev-addon-exec': patch
'@lincyaw/slidev-addon-exec-jupyter': patch
'@lincyaw/slidev-addon-exec-local': patch
'@lincyaw/slidev-addon-exec-wasi': patch
'@lincyaw/slidev-addon-exec-webgpu': patch
---

Name the execution plugins' public API after what each name does, and share what they repeated through the kernel and the host. Executor IDs, service IDs, directives and configuration keys are unchanged. Old name to new name:

- `@lincyaw/kernel`: new `componentCode` and `jupyterKernelLanguage`.
- `@lincyaw/kernel/node`: new `RUN_REQUEST_FILE`, `RUN_RESULT_PREFIX`, `runResultFile`, `minimalRunEnv`, `directSandbox` (the process sandbox when none is configured), and the Vite plugins `servedAssets` and `prebundleDependencies` with the types `ServedAssets` and `ServedAssetsPlugin`.
- `@lincyaw/host`: new `createResidentWorker` with the types `ResidentWorker`, `ResidentWorkerOptions`, `ResidentWorkerOutcome` and `ResidentWorkerFailure`.
- `@lincyaw/slidev-addon-exec` (`./client`): `runPlace` and `RunPlace` to `runsInOf` and `RunsIn`; `useSlideRoom` to `useSlideSpaceBelow`; `SCRIPT_EXECUTOR_ID` to `BROWSER_SCRIPT_EXECUTOR_ID`; new `PYODIDE_EXECUTOR_ID`. No longer exported: `useMessages` (use the host's `useMessages(MESSAGES)`).
- `@lincyaw/slidev-addon-exec` (`./domain`): `declarations` to `paramsPrelude`; `inBrowserPython` to `importableInBrowser`; new `mimeText`.
- `@lincyaw/slidev-addon-exec-jupyter` (`./domain`): `jupyterEnvironments` to `jupyterSpecs`; `JupyterEnvironments` and `JUPYTER_ENVIRONMENTS` to `JupyterTerminals` and `JUPYTER_TERMINALS` (the service ID `presmium.execJupyter.environments` is unchanged); `kernelOf` and `DEFAULT_KERNEL` to `jupyterKernelName` and `DEFAULT_JUPYTER_KERNEL`; `argumentsCode` to `argsPrelude`; `TerminalSession` and `TerminalEvents` are exported.
- `@lincyaw/slidev-addon-exec-jupyter` (`./client`): `createRemoteEnvironments` and `RemoteEnvironments` (its `service` is `terminals`) to `createJupyterClient` and `JupyterClient`; `jupyterPlugin` to `execJupyterPlugin`.
- `@lincyaw/slidev-addon-exec-local` (`./domain`): `Runners`, `DEFAULT_RUNNERS` and `runnersFrom` to `LanguageCommands`, `DEFAULT_LANGUAGE_COMMANDS` and `languageCommandsFrom` (the definition's key `customizations.presmium.runners` is unchanged); `failedContainerRun(message, durationMs)` to `failedContainerRun(message, executorId)`; new `DEVCONTAINER_KIND`.
- `@lincyaw/slidev-addon-exec-local` (`./client`): `createLocalEnv` and `LocalEnv` to `createLocalEnvClient` and `LocalEnvClient`; `localEnvPlugin` to `execLocalPlugin`. No longer exported: `useMessages`.
- `@lincyaw/slidev-addon-exec-wasi` (`./client`): `createWasiRunner`, `WasiRunner` and `WasiRunnerOptions` to `createWasiExecutors`, `WasiExecutors` and `WasiExecutorsOptions`; `wasiPlugin` to `execWasiPlugin`.
- `@lincyaw/slidev-addon-exec-webgpu` (`./domain`): `failure`, `summary`, `fingerprint`, `unavailable`, `runResult` and `declarations` to `failureText`, `summaryText`, `adapterFingerprint`, `isUnavailable`, `runResultOf` and `shaderBuffers`; new `WEBGPU_KIND`.

Fixes: the Jupyter plugin's server drops the proxy of an environment taken out of the headmatter at the next compile, and the local environment plugin runs each document's blocks in its own workspace when several documents are compiled in one process (`presmium serve`).
