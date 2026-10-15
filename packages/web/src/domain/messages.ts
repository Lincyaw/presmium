import type { Locale } from '@presmium/kernel/contracts'

/** What the web form says around the IR runtime, in each UI language (N-07). */
export const WEB_MESSAGES = {
  'zh-CN': {
    viewMenu: '视图',
    openInSlides: '在幻灯片中打开',
    readOnWeb: '在网页中阅读',
  },
  'en': {
    viewMenu: 'View',
    openInSlides: 'Open in the slides',
    readOnWeb: 'Read on the web',
  },
} satisfies Record<Locale, unknown>

/** The labels of the VitePress default theme and its local search, by language; English ones are VitePress's own. */
export const SITE_LABELS = {
  'zh-CN': {
    themeConfig: {
      outline: { level: [2, 3], label: '本页大纲' },
      sidebarMenuLabel: '目录',
      returnToTopLabel: '回到顶部',
      darkModeSwitchLabel: '外观',
    },
    search: {
      button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
      modal: {
        displayDetails: '显示详细列表',
        resetButtonTitle: '清除',
        backButtonTitle: '关闭搜索',
        noResultsText: '没有结果',
        footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
      },
    } as Record<string, unknown> | undefined,
  },
  'en': {
    themeConfig: {
      outline: { level: [2, 3], label: 'On this page' },
      sidebarMenuLabel: 'Menu',
      returnToTopLabel: 'Return to top',
      darkModeSwitchLabel: 'Appearance',
    },
    search: undefined as Record<string, unknown> | undefined,
  },
} satisfies Record<Locale, unknown>
