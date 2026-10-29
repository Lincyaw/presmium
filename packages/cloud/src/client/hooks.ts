import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, request } from './api.ts'
import type { Messages } from './messages.ts'

export function failureMessage(error: unknown, t: Messages): string {
  if (!(error instanceof ApiError)) {
    if (error instanceof Error && /^(document-|save-locked|revision-conflict|page-context-changed)/.test(error.message)) return t.errorPendingEdits
    return error instanceof TypeError ? t.errorNetwork : t.errorGeneric
  }
  if (error.code === 'history-plan-required') return t.errorHistoryPlan
  if (error.code === 'cloud-preview-required') return t.previewRequired
  if (error.code === 'publication-student-build-required') return t.publicationRequired
  if (error.code === 'collaborator-limit') return t.errorCollaborators
  if (['storage-limit', 'runtime-job-limit', 'runtime-concurrency-limit'].includes(error.code)) return t.errorQuota
  if (error.code === 'runtime-storage-pool-exhausted') return t.errorExecutionCapacity
  if (error.code === 'verified-email-required') return t.errorVerifiedEmail
  if (error.status === 401) return t.errorUnauthorized
  if (error.status === 403) return t.errorForbidden
  if (error.status === 404) return t.errorNotFound
  if (error.status === 409) return t.errorConflict
  if ([402, 429].includes(error.status)) return t.errorQuota
  if ([400, 413, 422].includes(error.status)) return t.errorInvalid
  if (error.status >= 500) return t.errorUnavailable
  return t.errorGeneric
}

export function useResource<T>(path: string | undefined, pollMs?: number) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ path?: string, data?: T, error?: unknown, loading: boolean }>({ loading: Boolean(path) })
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    if (!path) { setState({ loading: false }); return }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      setState(previous => ({ path, ...previous.path === path ? { data: previous.data } : {}, loading: true }))
      try {
        const data = await request<T>(path, { signal: controller.signal })
        if (!controller.signal.aborted) setState({ path, data, loading: false })
      } catch (error) {
        if (!controller.signal.aborted) setState(previous => ({ path, ...previous.path === path ? { data: previous.data } : {}, error, loading: false }))
      }
      if (pollMs && !controller.signal.aborted) timer = setTimeout(() => {
        if (document.visibilityState === 'visible') void load()
        else timer = setTimeout(load, pollMs)
      }, pollMs)
    }
    void load()
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [path, revision, pollMs])
  return { data: state.path === path ? state.data : undefined, error: state.path === path ? state.error : undefined, loading: state.path !== path || state.loading, refresh }
}

export function useMutation() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>()
  const active = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true); setError(undefined)
    try { await work() }
    catch (error) { if (active.current) setError(error) }
    finally { inFlight.current = false; if (active.current) setPending(false) }
  }
  return { pending, error, run, clear: () => setError(undefined) }
}
