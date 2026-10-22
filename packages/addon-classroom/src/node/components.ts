import type { ComponentNode, IRNode } from '@lincyaw/kernel'
import { CLASSROOM_ID } from '../domain/index.ts'

export function isClassroomComponent(node: IRNode): node is ComponentNode {
  return node.type === 'component' && node.plugin === CLASSROOM_ID
}

export function isPredict(node: IRNode): node is ComponentNode {
  return isClassroomComponent(node) && node.name === 'PmPredict'
}
