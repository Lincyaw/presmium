import { describe, expect, it, vi } from 'vitest'
import { createEventBus } from '../src/index.ts'

describe('EventBus', () => {
  it('delivers events by type until unsubscribed', () => {
    const bus = createEventBus()
    const seen: unknown[] = []
    const off = bus.on('ping', e => seen.push(e.payload))
    bus.on('other', () => seen.push('wrong'))
    bus.emit({ type: 'ping', payload: 1 })
    off()
    bus.emit({ type: 'ping', payload: 2 })
    expect(seen).toEqual([1])
  })

  it('isolates a throwing handler', () => {
    const onError = vi.fn()
    const bus = createEventBus(onError)
    const seen: string[] = []
    bus.on('ping', () => {
      throw new Error('bad handler')
    })
    bus.on('ping', () => seen.push('second'))
    bus.emit({ type: 'ping', payload: null })
    expect(seen).toEqual(['second'])
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { type: 'ping', payload: null })
  })
})
