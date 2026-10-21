import type { Page } from '@playwright/test'

export async function openPreviewMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: '打开预览', exact: true }).last().click()
}

export async function selectPreview(page: Page, view: 'web' | 'slides' = 'web'): Promise<void> {
  await openPreviewMenu(page)
  await page.getByRole('menuitem', { name: view === 'web' ? '文档预览' : '幻灯片预览', exact: true }).click()
}

export async function splitPreview(page: Page): Promise<void> {
  await page.getByRole('button', { name: '在侧边打开预览', exact: true }).first().click()
}
