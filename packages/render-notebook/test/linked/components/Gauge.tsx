export default function Gauge({ level }: { level: number }) {
  return <meter className="gauge" min={0} max={5} value={level} />
}
