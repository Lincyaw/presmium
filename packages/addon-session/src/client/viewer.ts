import type { ViewerPluginContext } from '@lincyaw/viewer'
import SessionBadge from './SessionBadge.tsx'

export default function sessionViewerPlugin({ registerLayer }: ViewerPluginContext): void {
  registerLayer({ id: 'presmium.session.badge', component: SessionBadge, scope: 'viewport' })
}
