import type { Component } from 'vue'
import SessionBadge from './SessionBadge.vue'

export interface SessionViewerContext {
  registerLayer(layer: { id: string, component: Component, scope?: 'view' | 'viewport' }): void
}

export default function sessionViewerPlugin({ registerLayer }: SessionViewerContext): void {
  registerLayer({ id: 'presmium.session.badge', component: SessionBadge, scope: 'viewport' })
}
