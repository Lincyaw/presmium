import { registerPresmiumPlugin } from '@lincyaw/host'
import { defineAppSetup } from '@slidev/types'
import { classroomPlugin } from '../src/client/plugin.ts'

export default defineAppSetup(() => {
  registerPresmiumPlugin(classroomPlugin)
})
