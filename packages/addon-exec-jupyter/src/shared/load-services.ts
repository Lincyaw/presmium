type JupyterServices = typeof import('@jupyterlab/services')

let loaded: Promise<JupyterServices> | undefined

/** `@jupyterlab/services`, loaded at its first use. */
export function loadJupyterServices(): Promise<JupyterServices> {
  loaded ??= import('@jupyterlab/services')
  return loaded
}
