import { useCallback, useLayoutEffect, useState } from 'react'
import { designLength } from '@lincyaw/design'

/** Layout belongs to the available pane, which can be much narrower than the application window. */
export function useContainerLayout() {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const ref = useCallback((node: HTMLElement | null) => setElement(node), [])
  const [layout, setLayout] = useState({ measured: false, narrow: true, roomy: false, productionWide: false })
  useLayoutEffect(() => {
    if (!element) return
    const update = () => {
      const width = element.getBoundingClientRect().width
      if (!width) return
      const next = { measured: true, narrow: width < designLength('--pm-layout-narrow-width', element), roomy: width >= designLength('--pm-layout-roomy-width', element), productionWide: width >= designLength('--pm-production-wide-width', element) }
      setLayout(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next)
    }
    const observer = new ResizeObserver(update); observer.observe(element); update()
    return () => observer.disconnect()
  }, [element])
  return { ...layout, ref }
}
