import { useState } from 'react'
import { PmButton, PmDialog, PmDrawer, PmMenu, PmPopover, PmSegmented, PmTabs } from '@lincyaw/host'
const options = [
  { value: 'one', label: '第一项' },
  { value: 'two', label: '第二项' },
]
export default function FixturePrimitives() {
  const [dialog, setDialog] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [popover, setPopover] = useState(false)
  const [tab, setTab] = useState('one')
  const [choice, setChoice] = useState('one')
  const [selected, setSelected] = useState('')
  return (
    <div className="fixture-primitives">
      <PmButton onClick={() => setDialog(true)}>打开弹窗</PmButton>
      <PmDialog open={dialog} onOpenChange={setDialog} label="设置弹窗" closeLabel="关闭弹窗">
        <label>
          姓名
          <input aria-label="姓名" />
        </label>
        <PmPopover
          open={popover}
          onOpenChange={setPopover}
          label="更多设置"
          trigger={<PmButton>更多设置</PmButton>}
        >
          <PmButton>浮层操作</PmButton>
        </PmPopover>
      </PmDialog>
      <PmButton onClick={() => setDrawer(true)}>打开抽屉</PmButton>
      <PmDrawer open={drawer} onOpenChange={setDrawer} label="文稿抽屉" closeLabel="关闭抽屉">
        <PmButton>抽屉操作</PmButton>
      </PmDrawer>
      <PmMenu
        label="文稿菜单"
        items={[
          { id: 'disabled', label: '不可选', disabled: true },
          { id: 'copy', label: '复制' },
          { id: 'delete', label: '删除' },
        ]}
        onSelect={setSelected}
      />
      <p role="status">{selected}</p>
      <PmTabs value={tab} onValueChange={setTab} tabs={options} label="内容标签">
        <p>{tab === 'one' ? '第一项内容' : '第二项内容'}</p>
      </PmTabs>
      <PmSegmented value={choice} onValueChange={setChoice} choices={options} label="显示方式" />
    </div>
  )
}
