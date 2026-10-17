import type { Locale } from '@presmium/kernel/contracts'

/** What the web form says around the IR runtime, in each UI language (N-07). */
export const WEB_MESSAGES = {
  'zh-CN': {
    viewMenu: '视图',
    openInSlides: '在幻灯片中打开',
    /** The short label of that link beside a section heading. */
    slides: '幻灯片',
    readOnWeb: '在网页中阅读',
    /** The hidden labels of the default theme's sidebar and doc footer, which its configuration has no option for. */
    sidebarNav: '侧边栏导航',
    pager: '翻页',
    /** The buttons of the navigation bar that open the navigation screen (phones) and the extra menu (tablets): "mobile navigation", "extra navigation". */
    mobileNav: '打开导航菜单',
    extraNav: '更多导航',
    /** The link of a workspace site's pages to its home page, and the heading of its documents. */
    documents: '文档列表',
    documentsHeading: '文档',
    /** The home page of a workspace site. */
    searchDocuments: '搜索文档',
    tags: '标签',
    allTags: '全部',
    noDocuments: '没有文档',
    /** The workbench of a served home page (docs/design/home.dc.html): its bars and their entries. */
    activity: '活动',
    launcher: '启动台',
    files: '工作区文件',
    search: '搜索',
    statusBar: '状态栏',
    toDark: '切换到深色模式',
    toLight: '切换到浅色模式',
    pages: (count: number) => `${count} 页`,
    checked: '检查通过',
    warnings: (count: number) => `${count} 个警告`,
    errors: (count: number) => `${count} 个错误`,
    mcp: '连接外部 agent（MCP）',
    mcpHint: 'Claude Code、Codex 等用它读讲义、运行代码、跳转放映；令牌在 presmium serve 启动时打印的文件中（Authorization: Bearer）。',
    copy: '复制',
    copied: '已复制',
    /** The panes of edit mode beside the page (docs/architecture.md 5.10). */
    sourcePane: '源码',
    dockPane: '编辑面板',
  },
  'en': {
    viewMenu: 'View',
    openInSlides: 'Open in the slides',
    slides: 'Slides',
    readOnWeb: 'Read on the web',
    sidebarNav: 'Sidebar Navigation',
    pager: 'Pager',
    mobileNav: 'mobile navigation',
    extraNav: 'extra navigation',
    documents: 'Documents',
    documentsHeading: 'Documents',
    searchDocuments: 'Search the documents',
    tags: 'Tags',
    allTags: 'All',
    noDocuments: 'No documents',
    activity: 'Activity',
    launcher: 'Launcher',
    files: 'Workspace files',
    search: 'Search',
    statusBar: 'Status bar',
    toDark: 'Switch to the dark theme',
    toLight: 'Switch to the light theme',
    pages: (count: number) => `${count} ${count === 1 ? 'page' : 'pages'}`,
    checked: 'Checks pass',
    warnings: (count: number) => `${count} ${count === 1 ? 'warning' : 'warnings'}`,
    errors: (count: number) => `${count} ${count === 1 ? 'error' : 'errors'}`,
    mcp: 'Connect an outside agent (MCP)',
    mcpHint: 'Claude Code, Codex and other agents use it to read the lectures, run code and move the slides; its token is in the file presmium serve prints when it starts (Authorization: Bearer).',
    copy: 'Copy',
    copied: 'Copied',
    sourcePane: 'Source',
    dockPane: 'Editing panels',
  },
} satisfies Record<Locale, unknown>

/**
 * The labels of the VitePress default theme and its local search, by
 * language: every label its configuration documents; English ones are
 * VitePress's own. The doc footer links the chapters before and after a
 * page. VitePress has no option for the hidden labels of its sidebar
 * ("Sidebar Navigation") and doc footer ("Pager"), nor for those of the
 * navigation bar's menu buttons ("mobile navigation", "extra navigation"):
 * the theme sets them in the browser (`WEB_MESSAGES`).
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
