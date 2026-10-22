import { AUTHOR_MARKS_CLASS } from '@lincyaw/kernel'
import { computed, defineComponent, h, shallowRef } from 'vue'
import { useSectionContext } from '../section-context.ts'

const authorMarks = shallowRef(false)
let observed = false

/** Whether the page shows the author's marks: the class `AUTHOR_MARKS_CLASS` on `<html>`, which a preview sets. */
function useAuthorMarks() {
  if (!observed && typeof document !== 'undefined') {
    observed = true
    const root = document.documentElement
    authorMarks.value = root.classList.contains(AUTHOR_MARKS_CLASS)
    new MutationObserver(() => {
      authorMarks.value = root.classList.contains(AUTHOR_MARKS_CLASS)
    }).observe(root, { attributes: true, attributeFilter: ['class'] })
  }
  return authorMarks
}

export const PmRoleMark = defineComponent({
  name: 'PmRoleMark',
  props: { mark: { type: String, required: true } },
  setup(props) {
    const section = useSectionContext()
    const marks = useAuthorMarks()
    const shown = computed(() => section?.view.value === 'presenter' || marks.value)
    return () => (shown.value ? h('span', { class: 'pm-role-mark' }, props.mark) : null)
  },
})
