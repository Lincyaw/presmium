import { useEffect, useRef, useState } from 'react'
import type { McpConnectionSettings } from '@lincyaw/kernel'
import { PmButton, PmCard, PmInput, PmNotice, PmPanelHeader, PmSelect, PmTextarea } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { MCP_SETTINGS_MESSAGES } from '../mcp-settings-messages.ts'
import { WorkspaceServerError } from '../workspace-client.ts'

export function McpSettingsPanel() {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), t = MCP_SETTINGS_MESSAGES[locale]
  const [settings, setSettings] = useState<McpConnectionSettings>(), [transport, setTransport] = useState<'stdio' | 'http'>('stdio'), [port, setPort] = useState('0')
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<string>(), [status, setStatus] = useState<string>(), [output, setOutput] = useState('')
  const owner = useRef(true), request = useRef<AbortController>()
  const accept = (value: McpConnectionSettings) => { setSettings(value); setTransport(value.transport); setPort(String(value.port)); setOutput('') }
  const load = async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller
    setBusy(true); setFailure(undefined); setStatus(undefined)
    try {
      if (!workbench.client.readMcpSettings) throw new Error('unsupported')
      const value = await workbench.client.readMcpSettings(controller.signal)
      if (owner.current && !controller.signal.aborted) accept(value)
    } catch (error) {
      if (owner.current && !controller.signal.aborted) setFailure(error instanceof WorkspaceServerError && error.status === 404 ? t.outdatedService : t.unavailable)
    }
    finally { if (owner.current && !controller.signal.aborted) setBusy(false) }
  }
  useEffect(() => { owner.current = true; void load(); return () => { owner.current = false; request.current?.abort() } }, [workbench])
  const dirty = settings && (transport !== settings.transport || Number(port) !== settings.port)
  const valid = /^\d+$/.test(port) && Number(port) <= 65535
  const save = async () => {
    if (!settings || !valid || !workbench.client.changeMcpSettings) return
    request.current?.abort(); const controller = new AbortController(); request.current = controller
    setBusy(true); setFailure(undefined); setStatus(undefined); setOutput('')
    try {
      const value = await workbench.client.changeMcpSettings({ revision: settings.revision, transport, port: Number(port) }, controller.signal)
      if (owner.current && !controller.signal.aborted) { accept(value); setStatus(t.saved) }
    } catch (error) {
      if (owner.current && !controller.signal.aborted) {
        const code = error instanceof WorkspaceServerError ? error.answer.error : undefined
        setFailure(code === 'mcp-port-unavailable' ? t.portBusy : code === 'mcp-settings-conflict' ? t.conflict : t.failed)
      }
    } finally { if (owner.current && !controller.signal.aborted) setBusy(false) }
  }
  const copy = async (prompt: boolean) => {
    if (!settings || dirty || !workbench.client.exportMcpSettings || !workbench.client.readMcpSettings) return
    setBusy(true); setFailure(undefined); setStatus(undefined)
    request.current?.abort(); const controller = new AbortController(); request.current = controller
    try {
      const fresh = await workbench.client.readMcpSettings(controller.signal)
      if (!owner.current || controller.signal.aborted) return
      accept(fresh)
      const content = prompt ? t.prompt.replace('{root}', fresh.root) + '\n\n' + (fresh.transport === 'stdio'
        ? JSON.stringify({ mcpServers: { presmium: fresh.stdio } }, null, 2)
        : t.httpPrompt.replace('{url}', fresh.url ?? '').replace('{stateFile}', fresh.stateFile))
        : JSON.stringify(await workbench.client.exportMcpSettings(fresh.revision, controller.signal), null, 2)
      if (!owner.current || controller.signal.aborted) return
      setOutput(content)
      try { await navigator.clipboard.writeText(content); if (owner.current) setStatus(t.copied) }
      catch { if (owner.current) setStatus(t.manualCopy) }
    } catch (error) { if (owner.current && !controller.signal.aborted) setFailure(error instanceof WorkspaceServerError && error.answer.error === 'mcp-settings-conflict' ? t.conflict : t.failed) }
    finally { if (owner.current && !controller.signal.aborted) setBusy(false) }
  }
  const ready = settings && !dirty && (settings.transport === 'stdio' ? settings.stdio : settings.url)
  return <section className="pmw-speech-settings pm-ui" aria-label={t.title}>
    <PmPanelHeader title={t.title} />
    <div className="pmw-speech-settings__content">
      <p>{t.description}</p>
      {!settings && busy && <PmNotice>{t.loading}</PmNotice>}
      {failure && <PmNotice tone="danger">{failure} <PmButton small disabled={busy} onClick={() => void load()}>{t.retry}</PmButton></PmNotice>}
      {status && <PmNotice tone="accent">{status}</PmNotice>}
      {settings && <PmCard><div className="pmw-speech-settings__fields">
        <PmSelect label={t.transport} hint={transport === 'stdio' ? t.stdioHint : t.httpHint} value={transport} disabled={busy} onChange={event => { setTransport(event.target.value as 'stdio' | 'http'); setStatus(undefined); setOutput('') }}>
          <option value="stdio" disabled={!settings.stdio}>{t.stdio}</option><option value="http">{t.http}</option>
        </PmSelect>
        {!settings.stdio && <PmNotice>{t.noCommand}</PmNotice>}
        {transport === 'http' && <PmInput label={t.port} hint={t.portHint} error={valid ? undefined : t.invalid} inputMode="numeric" value={port} disabled={busy} onChange={event => { setPort(event.target.value); setStatus(undefined); setOutput('') }} />}
        {settings.url && <PmInput label={t.address} value={settings.url} readOnly />}
        {settings.issue && <PmNotice tone="danger">{t.portBusy}</PmNotice>}
        <div className="pmw-speech-settings__actions"><PmButton small variant="primary" disabled={busy || !valid || !dirty && !settings.issue} onClick={() => void save()}>{t.save}</PmButton></div>
      </div></PmCard>}
      <p>{t.local}</p>
      {dirty && <PmNotice>{t.applyFirst}</PmNotice>}
      <div className="pmw-speech-settings__actions"><PmButton small variant="ghost" icon="copy" disabled={busy || !ready} onClick={() => void copy(false)}>{t.copyConfig}</PmButton><PmButton small variant="ghost" icon="sparkle" disabled={busy || !ready} onClick={() => void copy(true)}>{t.copyPrompt}</PmButton></div>
      {output && <PmTextarea label={t.output} readOnly rows={10} value={output} onFocus={event => event.target.select()} />}
    </div>
  </section>
}
