import { Fragment, useState, useRef, useEffect, useMemo, useId } from 'react'
import type { ReactNode } from 'react'
import { PmButton, useMessages, useStore } from '@lincyaw/host'
import type { AgentContext, Citation } from '@lincyaw/kernel'
import { answerParts, askProvider, ASSISTANT_MESSAGES } from '../domain/index.ts'
import AskSettings from './AskSettings.tsx'
import { askSettings as settingsStore } from './settings.ts'
import {
  askClient as clientStore,
  exchanges as exchangesStore,
  selected as selectionStore,
  showCitation,
  slideNavigation as navigationStore,
  startExchange,
  useWebViewerAccess,
} from './state.ts'
import './AskPanel.css'
export default function AskPanel(props: {
  children?: ReactNode
  className?: string
  onDone?(): void
  onCited?(): void
}) {
  const t = useMessages(ASSISTANT_MESSAGES)
  const askSettings = useStore(settingsStore)
  const askClient = useStore(clientStore)
  const exchanges = useStore(exchangesStore)
  const selected = useStore(selectionStore)
  const slideNavigation = useStore(navigationStore)
  const webViewer = useWebViewerAccess()
  const [text, setText] = useState('')
  const [changing, setChanging] = useState(false)
  const running = exchanges.some((e) => e.state === 'running')
  const service = askSettings && { provider: askProvider(askSettings.url), model: askSettings.model }
  const canShowCitations = Boolean(webViewer ?? slideNavigation)

  const place = (() => {
    const position = webViewer?.position() ?? slideNavigation?.position.getSnapshot()
    const section = selected?.section ?? position?.section
    return section
      ? {
          section,
          step: position?.section === section ? position.step : undefined,
          title: webViewer?.title(section) ?? section,
        }
      : undefined
  })()
  const excerpt = (() => {
    const value = selected?.text ?? ''
    return value.length > 120 ? `${value.slice(0, 120)}…` : value
  })()

  function submit(): void {
    const question = text.trim()
    const client = askClient
    if (!question || !client) return
    const context: AgentContext = {
      document: '',
      ...(place ? { section: place.section } : {}),
      ...(place?.step !== undefined ? { step: place.step } : {}),
      ...(selected?.block ? { block: selected.block } : {}),
      ...(selected ? { selection: selected.text } : {}),
    }
    startExchange(client, question, context)
    setText('')
    selectionStore.set(undefined)
  }

  function drop(): void {
    selectionStore.set(undefined)
  }

  function go(citation: Citation): void {
    showCitation(citation)
    props.onCited?.()
  }

  return (
    <>
      <div className="pm-assistant">
        {!service || changing ? (
          <AskSettings
            onDone={() => {
              setChanging(false)
            }}
          ></AskSettings>
        ) : (
          <>
            <p className="pm-assistant__provider">
              <span>{t.panel.provider(service.provider, service.model)}</span>
              <PmButton
                className="pm-assistant__service"
                variant="ghost"
                small
                icon="sliders"
                onClick={(event) => {
                  setChanging(true)
                }}
              >
                {t.panel.service}
              </PmButton>
            </p>
            <form
              className="pm-assistant__form"
              onSubmit={(event) => {
                event.preventDefault()
                submit()
              }}
            >
              {selected ? (
                <p className="pm-assistant__selection">
                  <span>{t.panel.selection}</span>
                  <code className="pm-ui-code">{excerpt}</code>
                  <PmButton variant="ghost" small onClick={drop}>
                    {t.panel.dropSelection}
                  </PmButton>
                </p>
              ) : null}
              {place ? <p className="pm-assistant__where">{t.panel.at(place.title)}</p> : null}
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="pm-ui-textarea"
                aria-label={t.panel.question}
                placeholder={t.panel.placeholder}
                rows={3}
                maxLength={2000}
                onKeyDown={(event) => {
                  event.stopPropagation()
                }}
              ></textarea>
              <p className="pm-assistant__actions">
                <PmButton type="submit" variant="primary" small disabled={!text.trim() || running}>
                  {t.panel.ask}
                </PmButton>
              </p>
            </form>
          </>
        )}
        {exchanges.length ? (
          <ol className="pm-assistant__answers" aria-label={t.panel.answers}>
            {exchanges.map((exchange) => (
              <li key={exchange.id} data-state={exchange.state}>
                <p className="pm-assistant__question">{exchange.question}</p>
                {exchange.answer ? (
                  <p className="pm-assistant__answer">
                    {answerParts(exchange.answer).map((part, j) => (
                      <>
                        {part.citation && canShowCitations ? (
                          <button
                            type="button"
                            className="pm-assistant__cite"
                            data-section={part.citation.section}
                            title={t.panel.cite(part.text)}
                            onClick={(event) => {
                              go(part.citation!)
                            }}
                          >
                            {part.text}
                          </button>
                        ) : (
                          <span>{part.text}</span>
                        )}
                      </>
                    ))}
                  </p>
                ) : null}
                {exchange.state === 'running' ? (
                  <p className="pm-assistant__status" role="status">
                    {t.panel.answering}
                    <PmButton
                      variant="ghost"
                      small
                      onClick={(event) => {
                        exchange.cancel()
                      }}
                    >
                      {t.panel.cancel}
                    </PmButton>
                  </p>
                ) : exchange.cancelled ? (
                  <p className="pm-assistant__status">{t.panel.cancelled}</p>
                ) : exchange.state === 'failed' ? (
                  <p className="pm-assistant__error" role="alert">
                    {t.panel.failed(exchange.error ?? '')}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </>
  )
}
