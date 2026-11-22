import { useEffect, useState } from 'react'
import type { VoiceCatalogAnswer, VoiceInfo } from '@lincyaw/kernel'
import { useWorkbench, useWorkbenchState } from './context.tsx'
import type { WorkspaceClient } from './workspace-client.ts'

interface Entry { answer: Promise<VoiceCatalogAnswer>, value?: VoiceCatalogAnswer }
const clients = new WeakMap<WorkspaceClient, Map<string, Entry>>()
const keyOf = (directory: string, engine: string | undefined, lang: string, serviceVersion: number | undefined) => JSON.stringify([directory, engine ?? '', lang, serviceVersion ?? 0])

function entryOf(client: WorkspaceClient, directory: string, engine: string | undefined, lang: string, serviceVersion: number | undefined): Entry {
  let entries = clients.get(client)
  if (!entries) clients.set(client, entries = new Map())
  const key = keyOf(directory, engine, lang, serviceVersion), known = entries.get(key)
  if (known) return known
  const entry: Entry = { answer: client.readVoiceCatalog(directory, engine) }
  entries.set(key, entry)
  entry.answer.then(value => {
    entry.value = value
    // The default engine's list is also that engine's: a voice chosen from it is named at once.
    const named = value.engine && !engine ? keyOf(directory, value.engine, lang, serviceVersion) : undefined
    if (named && !entries.has(named)) entries.set(named, entry)
  }, () => { if (entries.get(key) === entry) entries.delete(key) })
  return entry
}

/**
 * The voice list of a document's speech service, read once per engine, document language and service change and shared
 * by every place that names or offers a voice. A failed read is not kept: the next one asks again.
 */
export function readVoiceCatalog(client: WorkspaceClient, directory: string, engine: string | undefined, lang: string, serviceVersion: number | undefined): Promise<VoiceCatalogAnswer> {
  return entryOf(client, directory, engine, lang, serviceVersion).answer
}

const listed = (value: VoiceCatalogAnswer | undefined) => value?.catalog.voices ?? []

/** The voices of the given engines (the default one for `undefined`), for naming the saved voices; empty until read. */
export function useVoiceNames(directory: string | undefined, engines: readonly (string | undefined)[], lang: string): VoiceInfo[] {
  const workbench = useWorkbench(), serviceVersion = useWorkbenchState(state => state.voiceServiceVersion)
  // A read that failed is asked again when the document is next saved.
  const version = useWorkbenchState(state => state.authoring?.version)
  const key = JSON.stringify(engines)
  const [read, setRead] = useState<{ key: string, voices: VoiceInfo[] }>()
  const request = JSON.stringify([directory, key, lang, serviceVersion ?? 0])
  useEffect(() => {
    if (directory === undefined || !engines.length) return
    let live = true
    void Promise.all(engines.map(engine => readVoiceCatalog(workbench.client, directory, engine, lang, serviceVersion).then(listed, () => [])))
      .then(lists => { if (live) setRead({ key: request, voices: lists.flat() }) })
    return () => { live = false }
  }, [workbench, request, version])
  // Lists already read name the voice in the same frame it is chosen.
  const entries = clients.get(workbench.client)
  if (directory === undefined) return []
  const known = engines.map(engine => entries?.get(keyOf(directory, engine, lang, serviceVersion))?.value)
  if (known.every(Boolean)) return known.flatMap(listed)
  return read?.key === request ? read.voices : []
}
