import { PmBadge, PmEmpty, PmIcon, useMessages } from '@lincyaw/host'
import type { PropType } from 'vue'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { WEB_MESSAGES } from '../../domain/index.ts'
import type { AppConfig, HomeDocument, SiteLocale } from '../../domain/index.ts'
import { SiteFooter, SiteHeader } from './layout.ts'

/** The workspace site's home page: a card for each document, found by words and tags. */
export const WorkspaceHome = defineComponent({
  name: 'PresmiumSiteHome',
  props: {
    config: { type: Object as PropType<AppConfig>, required: true },
  },
  setup(props) {
    const t = useMessages(WEB_MESSAGES)
    const query = ref('')
    const tag = ref<string>()
    const input = ref<HTMLInputElement>()
    const documents = computed(() => props.config.documents ?? [])
    const tags = computed(() => [...new Set(documents.value.flatMap(doc => doc.tags ?? []))].sort())
    const shown = computed(() => {
      const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
      return documents.value.filter(doc => (!tag.value || doc.tags?.includes(tag.value))
        && words.every(word => `${doc.title} ${doc.dir} ${doc.description ?? ''} ${(doc.tags ?? []).join(' ')}`.toLowerCase().includes(word)))
    })
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.value?.focus()
      }
    }
    onMounted(() => window.addEventListener('keydown', onKey))
    onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
    const hrefIn = (locale: SiteLocale) => locale.base

    const card = (doc: HomeDocument) => {
      const problems = doc.problems
      return h('li', { 'class': 'pm-site-home__document pm-ui-card pm-ui-card--interactive', 'data-document': doc.dir }, [
        h('a', { class: 'pm-site-home__link', href: doc.href, ...doc.lang ? { lang: doc.lang } : {} }, doc.title),
        doc.description ? h('p', { class: 'pm-site-home__description' }, doc.description) : null,
        h('div', { class: 'pm-ui-badges' }, [
          h(PmBadge, { class: 'pm-site-home__dir' }, () => `${doc.dir}/`),
          doc.pages ? h(PmBadge, null, () => t.value.pages(doc.pages!)) : null,
          doc.lang ? h(PmBadge, null, () => doc.lang) : null,
          ...(doc.tags ?? []).map(name => h(PmBadge, { class: 'pm-site-home__badge' }, () => name)),
          problems
            ? problems.errors
              ? h(PmBadge, { tone: 'danger' }, () => t.value.errors(problems.errors))
              : problems.warnings ? h(PmBadge, { tone: 'warn' }, () => t.value.warnings(problems.warnings)) : h(PmBadge, { tone: 'ok' }, () => t.value.checked)
            : null,
        ]),
      ])
    }

    return () => h('div', { class: 'pm-site pm-site--home' }, [
      h('a', { class: 'pm-site__skip', href: '#pm-site-main' }, t.value.skipToContent),
      h(SiteHeader, { config: props.config, titleHref: props.config.base, hrefIn }),
      h('main', { id: 'pm-site-main', class: 'pm-site-home pm-ui', tabindex: -1 }, [
        h('h1', { class: 'pm-site-home__title' }, props.config.site.title),
        h('section', { 'class': 'pm-site-home__section', 'aria-labelledby': 'pm-site-home-documents' }, [
          h('div', { class: 'pm-site-home__filters' }, [
            h('h2', { id: 'pm-site-home-documents', class: 'pm-ui-heading' }, t.value.documentsHeading),
            h('label', { class: 'pm-ui-search pm-site-home__search-box' }, [
              h(PmIcon, { name: 'search' }),
              h('input', {
                'ref': input,
                'class': 'pm-site-home__search',
                'type': 'search',
                'value': query.value,
                'placeholder': t.value.searchDocuments,
                'aria-label': t.value.searchDocuments,
                'onInput': (event: Event) => query.value = (event.target as HTMLInputElement).value,
              }),
              h('kbd', { class: 'pm-ui-kbd' }, t.value.searchShortcut),
            ]),
            tags.value.length > 0
              ? h('div', { 'class': 'pm-site-home__tags pm-ui-segmented', 'role': 'group', 'aria-label': t.value.tags }, [
                  h('button', { 'type': 'button', 'class': 'pm-site-home__tag pm-ui-segmented__option', 'aria-pressed': tag.value === undefined, 'onClick': () => tag.value = undefined }, t.value.allTags),
                  ...tags.value.map(name => h('button', { 'type': 'button', 'class': 'pm-site-home__tag pm-ui-segmented__option', 'aria-pressed': tag.value === name, 'onClick': () => tag.value = tag.value === name ? undefined : name }, name)),
                ])
              : null,
          ]),
          shown.value.length === 0
            ? h(PmEmpty, { class: 'pm-site-home__empty', icon: 'document' }, () => t.value.noDocuments)
            : h('ul', { class: 'pm-site-home__documents', role: 'list' }, shown.value.map(card)),
        ]),
        h(SiteFooter, { config: props.config }),
      ]),
    ])
  },
})

/** A page that does not exist: the site's header, the reason and the way back. */
export const MissingPage = defineComponent({
  name: 'PresmiumMissingPage',
  props: {
    config: { type: Object as PropType<AppConfig>, required: true },
  },
  setup(props) {
    const t = useMessages(WEB_MESSAGES)
    const hrefIn = (locale: SiteLocale) => locale.base
    return () => h('div', { class: 'pm-site pm-site--missing' }, [
      h(SiteHeader, { config: props.config, titleHref: props.config.base, hrefIn }),
      h('main', { id: 'pm-site-main', class: 'pm-site-missing' }, [
        h('p', { class: 'pm-site-missing__code' }, '404'),
        h('h1', { class: 'pm-site-missing__title' }, t.value.notFound),
        h('p', { class: 'pm-site-missing__text' }, t.value.notFoundText),
        h('a', { class: 'pm-ui-button pm-ui-button--primary', href: props.config.base }, t.value.backHome),
      ]),
    ])
  },
})
