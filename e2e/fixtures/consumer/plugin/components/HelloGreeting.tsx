import './HelloGreeting.css'
import { useMessages } from '@lincyaw/host'
export default function HelloGreeting({ name }: { name: string }) {
  const t = useMessages({ 'zh-CN': { hello: '你好' }, en: { hello: 'Hello' } })
  return (
    <p className="hello-greeting">
      {t.hello}, {name}!
    </p>
  )
}
