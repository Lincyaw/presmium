import type { Page } from '@playwright/test'

/** Shows the open document's page or presentation with the toolbar's view switch. */
export async function selectView(page: Page, view: 'web' | 'slides' = 'web'): Promise<void> {
  await page.getByRole('group', { name: '视图' }).getByRole('button', { name: view === 'web' ? '文档' : '放映', exact: true }).click()
}
