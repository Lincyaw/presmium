import './DemoStepper.css'
import { useStep, useStepScope } from '@lincyaw/host'
export default function DemoStepper({ steps = ['解析文稿', '启动插件', '渲染页面'] }: { steps?: string[] }) {
  const step = useStep()
  const scope = useStepScope()
  const reached = Math.max(0, Math.min(steps.length, step - scope.at))
  return (
    <ol className="demo-stepper" data-step={reached}>
      {steps.map((label, index) => (
        <li
          key={label}
          data-pm-click={step >= scope.step(index + 1) ? 'shown' : 'hidden'}
          data-status={
            step < scope.step(index + 1)
              ? 'pending'
              : index + 1 < steps.length && step >= scope.step(index + 2)
                ? 'done'
                : 'active'
          }
        >
          {label}
        </li>
      ))}
    </ol>
  )
}
