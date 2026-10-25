export default function FixtureBoom({ fail }: { fail?: boolean }) {
  if (fail) throw new Error('boom')
  return <p className="fx-boom">all good</p>
}
