import {
  currentLocale,
  usePrefersReducedMotion,
  usePresentationMode,
} from '@lincyaw/host'
import { deriveOptions, Markmap } from 'markmap-view'
import { useEffect, useRef, useState } from 'react'
import { decodeMarkmap, MESSAGES } from '../domain/index.ts'
import './MarkmapView.css'
export default function MarkmapView({ data }: { data: string }) {
  const interactive = usePresentationMode() === 'document',
    reduced = usePrefersReducedMotion(),
    svg = useRef<SVGSVGElement>(null),
    [failure, setFailure] = useState<unknown>()
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const { root, options } = decodeMarkmap(data)
    let map: Markmap | undefined
    let disposed = false
    const fit = () => {
      if (!map) return
      const { x1, y1, x2, y2 } = map.state.rect,
        width = el.clientWidth,
        height = el.clientHeight
      const scale =
        map.options.fitRatio *
        Math.min(
          width / (x2 - x1 + 16),
          height / (y2 - y1 + 16),
          map.options.maxInitialScale,
        )
      map.zoom.extent([
        [0, 0],
        [width, height],
      ])
      map.zoom.scaleTo(map.svg, scale)
      map.zoom.translateTo(map.svg, (x1 + x2) / 2, (y1 + y2) / 2)
    }
    const draw = async () => {
      if (disposed || !el.clientWidth) return
      if (map) return fit()
      map = Markmap.create(el, {
        ...deriveOptions(options),
        autoFit: false,
        zoom: interactive,
        pan: interactive,
      })
      const duration = map.options.duration
      await map.setData(root, { duration: 0 })
      if (disposed) return
      fit()
      map.setOptions({ duration: reduced ? 0 : duration })
    }
    const observer = new ResizeObserver(() => void draw().catch(setFailure))
    observer.observe(el)
    const toggles = new MutationObserver(() => {
      for (const circle of el.querySelectorAll('g.markmap-node > circle')) {
        const node = circle.parentElement!
        circle.setAttribute('tabindex', '0')
        circle.setAttribute('role', 'button')
        circle.setAttribute(
          'aria-expanded',
          String(!node.classList.contains('markmap-fold')),
        )
        circle.setAttribute(
          'aria-label',
          MESSAGES[currentLocale()].toggle(
            node.querySelector('foreignObject')?.textContent?.trim() ?? '',
          ),
        )
      }
    })
    toggles.observe(el, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    void draw().catch(setFailure)
    return () => {
      disposed = true
      observer.disconnect()
      toggles.disconnect()
      map?.destroy()
    }
  }, [data, interactive, reduced])
  if (failure) throw failure
  return (
    <svg
      ref={svg}
      className="pm-markmap"
      onKeyDown={(event) => {
        const target = event.target as Element
        if (
          (event.key === 'Enter' || event.key === ' ') &&
          target.matches('g.markmap-node > circle')
        ) {
          event.preventDefault()
          event.stopPropagation()
          target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        }
      }}
    />
  )
}
