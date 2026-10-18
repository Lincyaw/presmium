import { createServerClient, pluginsOf, registerPresmiumPlugin, startHost, stopPresmium } from '@presmium/host'
import { configs } from '@slidev/client'
import { presmiumConfig, presmiumEnvironments } from '../domain/index.ts'
import { createSlidevNavigation, useSlideSections } from './navigation.ts'
import * as clientPlugin from './plugin.ts'
import { createSyncTransports } from './sync.ts'

/**
 * Starts the kernel in the slides form with the host services (`startHost`).
 * Runs from `setup/root.ts`, i.e. after every addon's `setup/main.ts` has
 * registered its plugins, in the root component's setup (where the
 * navigation service reads Slidev's navigation). The plugins are disposed
 * when the page goes away or this module is hot updated. In `presmium dev`
 * the page gets the server's client (`useServer`) and its control channel.
 */
export function startSlidevPresmium(): void {
  const config = presmiumConfig(configs)
  pluginsOf(clientPlugin, config).forEach(registerPresmiumPlugin)
  // The slides renderer marks the deck that `presmium dev` serves, whose dev server proxies `/__presmium/` to the server;
  // a preview of the workspace service names its document (`presmiumDocument`), whose routes its requests reach.
  const { presmiumServer, presmiumDocument } = configs as { presmiumServer?: unknown, presmiumDocument?: unknown }
  const server = presmiumServer === true ? createServerClient(typeof presmiumDocument === 'string' ? { document: presmiumDocument } : {}) : undefined
  // The slides renderer writes the deck's named environments into the headmatter (the IR's `config.execute.environments`).
  const environments = presmiumEnvironments(configs)
  // The slides by section (D-4): the navigation and the synchronized state go by section between builds.
  const sections = useSlideSections()
  void startHost({ mode: 'slides', config, navigation: createSlidevNavigation(sections), transports: createSyncTransports(sections), server, environments })
}

import.meta.hot?.dispose(() => stopPresmium())
