import { createElement } from 'react'
import SceneView from '../src/client/SceneView.tsx'

export interface SceneProps {
  scene: string
  durations?: number[]
  aspect?: string
  height?: string
  alt?: string
  still?: string
}

export default function PmScene(props: SceneProps) {
  return createElement(SceneView, {
    ...props,
    key: JSON.stringify([props.scene, props.durations ?? []]),
  })
}
