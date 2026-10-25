import { useSectionConfig } from '@lincyaw/host'
export default function FixtureConfig() {
  const config = useSectionConfig('fixture.core')
  return <p className="fx-config">{String(config.label ?? '')}</p>
}
