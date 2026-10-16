// A viewer plugin that fails while it installs (architecture 5.1): the web form leaves it out,
// installs the other plugins and reports it as failed in the start report.
export default function brokenViewerPlugin(): void {
  throw new Error('the fixture viewer plugin failed on purpose')
}
