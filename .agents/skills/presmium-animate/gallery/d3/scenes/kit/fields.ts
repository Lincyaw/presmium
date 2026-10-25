// A small hierarchy shared by the hierarchy scenes (tree, pack, treemap, sunburst): fields of computer science,
// with a size per leaf.
export interface Field { name: string, value?: number, children?: Field[] }

export const FIELDS: Field = {
  name: '计算机',
  children: [
    { name: '系统', children: [{ name: '操作系统', value: 8 }, { name: '数据库', value: 6 }, { name: '网络', value: 7 }, { name: '分布式', value: 5 }] },
    { name: '理论', children: [{ name: '算法', value: 9 }, { name: '复杂性', value: 4 }, { name: '密码学', value: 5 }] },
    {
      name: '人工智能',
      children: [
        { name: '机器学习', children: [{ name: '监督', value: 7 }, { name: '无监督', value: 4 }, { name: '强化', value: 5 }] },
        { name: '视觉', value: 6 },
        { name: '语言', value: 8 },
      ],
    },
    { name: '图形', children: [{ name: '渲染', value: 5 }, { name: '几何', value: 3 }, { name: '动画', value: 4 }] },
    { name: '软件', children: [{ name: '编程语言', value: 6 }, { name: '编译器', value: 5 }, { name: '测试', value: 3 }] },
  ],
}
