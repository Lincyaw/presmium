import { createServerClient, pluginsOf, registerPresmiumPlugin, startHost, stopHost } from '@lincyaw/host'
import { configs } from '@slidev/client'
import { presmiumConfig, presmiumEnvironments } from '../domain/index.ts'
import { createSlidevNavigation, useSlideSections } from './navigation.ts'
import * as clientPlugin from './plugin.ts'
import { createSyncTransports } from './sync.ts'

export function startSlidevPresmium(): void {
  const config = presmiumConfig(configs)
  pluginsOf(clientPlugin, config).forEach(registerPresmiumPlugin)
  const { presmiumServer, presmiumDocument } = configs as { presmiumServer?: unknown, presmiumDocument?: unknown }
  const server = presmiumServer === true ? createServerClient(typeof presmiumDocument === 'string' ? { document: presmiumDocument } : {}) : undefined
  const environments = presmiumEnvironments(configs)
  const sections = useSlideSections()
  void startHost({ mode: 'slides', config, navigation: createSlidevNavigation(sections), transports: createSyncTransports(sections), server, environments })
}

import.meta.hot?.dispose(() => stopHost())
