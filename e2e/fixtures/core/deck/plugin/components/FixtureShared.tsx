import { useSharedState } from '@lincyaw/host'
export default function FixtureShared() {
  const [count, setCount] = useSharedState('fixture.core.count', 0)
  const [remote, setRemote] = useSharedState('fixture.core.remote', 0, { scope: 'remote' })
  return (
    <>
      <p className="fx-shared">
        <output className="fx-shared__count">{count}</output>
        <button type="button" onClick={() => setCount(count + 1)}>
          Add one
        </button>
      </p>
      <p className="fx-remote">
        <output className="fx-remote__count">{remote}</output>
        <button type="button" onClick={() => setRemote(remote + 1)}>
          Count on every device
        </button>
      </p>
    </>
  )
}
