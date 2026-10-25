import { Fragment, useState, useRef, useEffect, useMemo, useId } from 'react'
import type { ReactNode } from 'react'
import { PmButton, PmField, PmNotice, useMessages, useStore } from '@lincyaw/host'
import { ASSISTANT_MESSAGES, isAskUrlValid } from '../domain/index.ts'
import { askSettings as settingsStore, saveAskSettings } from './settings.ts'
import './AskSettings.css'
export default function AskSettings(props: {
  children?: ReactNode
  className?: string
  onDone?(): void
  onCited?(): void
}) {
  const t = useMessages(ASSISTANT_MESSAGES)
  const askSettings = useStore(settingsStore)
  const [url, setUrl] = useState(askSettings?.url ?? '')
  const [key, setKey] = useState(askSettings?.key ?? '')
  const [model, setModel] = useState(askSettings?.model ?? '')
  const [problem, setProblem] = useState('')

  function save(): void {
    if (!isAskUrlValid(url.trim())) {
      setProblem(t.ask.invalidUrl)
      return
    }
    saveAskSettings({ url: url.trim(), key: key.trim(), model: model.trim() })
    props.onDone?.()
  }

  function clear(): void {
    saveAskSettings(undefined)
    setUrl('')
    setKey('')
    setModel('')
  }

  return (
    <>
      <form
        className="pm-assistant-settings"
        aria-label={t.ask.title}
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <h3 className="pm-assistant-settings__title">{t.ask.title}</h3>
        <p className="pm-assistant-settings__intro">{t.ask.intro}</p>
        <PmNotice className="pm-assistant-settings__storage" tone="warn">
          {t.ask.storage}
        </PmNotice>
        <PmField label={t.ask.url}>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="pm-ui-input"
            name="url"
            type="url"
            required
            placeholder={t.ask.urlPlaceholder}
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(event) => {
              event.stopPropagation()
            }}
          ></input>
        </PmField>
        <PmField label={t.ask.key}>
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className="pm-ui-input"
            name="key"
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(event) => {
              event.stopPropagation()
            }}
          ></input>
        </PmField>
        <PmField label={t.ask.model}>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="pm-ui-input"
            name="model"
            type="text"
            required
            placeholder={t.ask.modelPlaceholder}
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(event) => {
              event.stopPropagation()
            }}
          ></input>
        </PmField>
        {problem ? <p className="pm-assistant-settings__problem">{problem}</p> : null}
        <p className="pm-assistant-settings__actions">
          <PmButton type="submit" variant="primary" small>
            {t.ask.save}
          </PmButton>
          {askSettings ? (
            <PmButton
              small
              onClick={(event) => {
                props.onDone?.()
              }}
            >
              {t.ask.cancel}
            </PmButton>
          ) : null}
          {askSettings ? (
            <PmButton variant="danger" small onClick={clear}>
              {t.ask.clear}
            </PmButton>
          ) : null}
        </p>
      </form>
    </>
  )
}
