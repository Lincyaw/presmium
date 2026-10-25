import { useMessages, useService, useStartReport } from '@lincyaw/host'
import type { ServiceToken } from '@lincyaw/kernel'
const GREETING = Object.freeze({ id: 'fixture.host.greeting' }) as ServiceToken<string>
const MESSAGES = {
  'zh-CN': { unavailable: '问候服务不可用', starting: '内核启动中……' },
  en: { unavailable: 'The greeting service is unavailable', starting: 'Starting the kernel…' },
}
export default function DemoGreeting() {
  const t = useMessages(MESSAGES)
  const greeting = useService(GREETING)
  const report = useStartReport()
  return <p className="demo-greeting">{greeting ?? (report ? t.unavailable : t.starting)}</p>
}
