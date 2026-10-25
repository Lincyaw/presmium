import { Component, createElement as h } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { errorMessage } from '@lincyaw/kernel'
import { createStore } from './store.ts'
import { HOST_MESSAGES } from './messages.ts'
import { currentLocale } from './locale.ts'
export interface ComponentError { component: string, message: string }
export const componentErrorRevision = createStore(0)
const errors = new Map<object, ComponentError>()
export function componentErrors(): readonly ComponentError[] { return [...errors.values()] }
export class PmBoundary extends Component<{ name?: string, resetKey?: unknown, children?: ReactNode }, { error?: ComponentError }> {
  state: { error?: ComponentError } = {}
  static getDerivedStateFromError(error: unknown) { return { error: { component: 'component', message: errorMessage(error) } } }
  componentDidCatch(error: unknown, _info: ErrorInfo) { const problem = { component: this.props.name ?? 'component', message: errorMessage(error) }; errors.set(this, problem); componentErrorRevision.set(n => n + 1); this.setState({ error: problem }); console.error(`[presmium] ${problem.component} failed`, error) }
  componentDidUpdate(before: Readonly<{ name?: string, resetKey?: unknown }>) { if (before.resetKey !== this.props.resetKey && this.state.error) { errors.delete(this); componentErrorRevision.set(n => n + 1); this.setState({ error: undefined }) } }
  componentWillUnmount() { if (errors.delete(this)) componentErrorRevision.set(n => n + 1) }
  render() { const error = this.state.error; return error ? h('div', { className: 'pm-boundary-error', role: 'alert', 'data-pm-error': error.component }, HOST_MESSAGES[currentLocale()].componentError(error.component, error.message)) : this.props.children }
}
