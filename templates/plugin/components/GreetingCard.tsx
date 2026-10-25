import './GreetingCard.css'
import { PmButton, useMessages, useServer } from '@lincyaw/host'
import { useState } from 'react'
import { GREETING_MESSAGES, PLUGIN_ID } from '../src/domain/index.ts'
import type { Waves } from '../src/domain/index.ts'
export default function GreetingCard({ name }: { name: string }) {
  const t = useMessages(GREETING_MESSAGES)
  const server = useServer()
  const [waves, setWaves] = useState<number>()
  async function wave() {
    const response = await server.fetch(PLUGIN_ID, 'waves', { method: 'POST' })
    if (response.ok) setWaves(((await response.json()) as Waves).waves)
  }
  return (
    <div className="greeting-card">
      <p className="greeting-card__text">{t.greeting(name)}</p>
      {server.available && (
        <p className="greeting-card__waves">
          <PmButton small onClick={wave}>
            {t.wave}
          </PmButton>
          {waves !== undefined && <span className="greeting-card__count">{t.waves(waves)}</span>}
        </p>
      )}
    </div>
  )
}
