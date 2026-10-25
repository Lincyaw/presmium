import { useMessages } from '@lincyaw/host'
import { useEffect, useState } from 'react'
import { offlineRuntimes, saveOffline } from '../src/client/offline.ts'
import { MESSAGES } from '../src/domain/index.ts'
import './PmSaveOffline.css'
export default function PmSaveOffline() {
  const t = useMessages(MESSAGES),
    [state, setState] = useState<
      'hidden' | 'offered' | 'saving' | 'saved' | 'failed'
    >('hidden'),
    [megabytes, setMegabytes] = useState(0)
  useEffect(() => {
    let active = true
    const ask = async () => {
      const runtimes = await offlineRuntimes()
      if (!active || !runtimes || runtimes.bytes === 0) return
      setMegabytes(Math.max(1, Math.round(runtimes.bytes / 2 ** 20)))
      setState((old) =>
        old === 'hidden' ? (runtimes.saved ? 'saved' : 'offered') : old,
      )
    }
    const workers = navigator.serviceWorker
    workers?.addEventListener('controllerchange', ask)
    void ask()
    return () => {
      active = false
      workers?.removeEventListener('controllerchange', ask)
    }
  }, [])
  const save = async () => {
    setState('saving')
    setState((await saveOffline()) ? 'saved' : 'failed')
  }
  return state !== 'hidden' ? (
    <button
      type="button"
      className="pm-save-offline pm-ui-button pm-ui-button--small"
      data-state={state}
      disabled={state === 'saving' || state === 'saved'}
      onClick={() => void save()}
    >
      {state === 'saving'
        ? t.savingOffline
        : state === 'saved'
          ? t.savedOffline
          : state === 'failed'
            ? t.saveOfflineFailed
            : t.saveOffline(megabytes)}
    </button>
  ) : null
}
