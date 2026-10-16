import type { Locale } from '@presmium/kernel/contracts'

/** What the web form says around the IR runtime, in each UI language (N-07). */
export const WEB_MESSAGES = {
  'zh-CN': {
    viewMenu: '视图',
    openInSlides: '在幻灯片中打开',
    /** The short label of that link beside a section heading. */
    slides: '幻灯片',
    readOnWeb: '在网页中阅读',
  },
  'en': {
    viewMenu: 'View',
    openInSlides: 'Open in the slides',
    slides: 'Slides',
    readOnWeb: 'Read on the web',
  },
} satisfies Record<Locale, unknown>

/**
 * The labels of the VitePress default theme and its local search, by
 * language: every label its configuration documents; English ones are
 * VitePress's own. The doc footer links the chapters before and after a
 * page. VitePress has no option for the hidden labels of its sidebar
 * ("Sidebar Navigation") and doc footer ("Pager"): they stay English.
 */
export const SITE_LABELS = {
  'zh-CN': {
    themeConfig: {
      outline: { level: [2, 3], label: '本页大纲' },
      docFooter: { prev: '上一章', next: '下一章' },
      sidebarMenuLabel: '目录',
      returnToTopLabel: '回到顶部',
      darkModeSwitchLabel: '外观',
      lightModeSwitchTitle: '切换到浅色模式',
      darkModeSwitchTitle: '切换到深色模式',
      skipToContentLabel: '跳到正文',
      langMenuLabel: '切换语言',
      lastUpdated: { text: '最后更新于' },
      notFound: {
        title: '页面不存在',
        quote: '这个地址没有对应的页面，可能已经移动或删除。',
        linkLabel: '返回首页',
        linkText: '返回首页',
      },
    },
    search: {
      button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
      modal: {
        displayDetails: '显示详细列表',
        resetButtonTitle: '清除',
        backButtonTitle: '关闭搜索',
        noResultsText: '没有结果',
        footer: {
          selectText: '选择',
          selectKeyAriaLabel: '回车键',
          navigateText: '切换',
          navigateUpKeyAriaLabel: '上箭头',
          navigateDownKeyAriaLabel: '下箭头',
          closeText: '关闭',
          closeKeyAriaLabel: 'Esc 键',
        },
      },
    } as Record<string, unknown> | undefined,
  },
  'en': {
    themeConfig: {
      outline: { level: [2, 3], label: 'On this page' },
      docFooter: { prev: 'Previous chapter', next: 'Next chapter' },
      sidebarMenuLabel: 'Menu',
      returnToTopLabel: 'Return to top',
      darkModeSwitchLabel: 'Appearance',
    },
    search: undefined as Record<string, unknown> | undefined,
  },
} satisfies Record<Locale, unknown>
