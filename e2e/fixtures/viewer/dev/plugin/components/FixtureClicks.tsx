import { useStep, useStepScope } from '@lincyaw/host'
export default function FixtureClicks({ items }: { items: string[] }) {
  const step = useStep()
  const scope = useStepScope()
  return (
    <p className="fx-clicks">
      {items.map((item, index) => (
        <span
          key={item}
          className="fx-clicks__item"
          data-pm-click={step >= scope.step(index + 1) ? 'shown' : 'hidden'}
        >
          {item}
        </span>
      ))}
      <b
        className="fx-clicks__last"
        data-pm-click={step >= scope.step(items.length + 1) ? 'shown' : 'hidden'}
      >
        尾
      </b>
    </p>
  )
}
