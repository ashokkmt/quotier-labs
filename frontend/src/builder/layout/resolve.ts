import type { BuilderNode, BuilderTarget, StyleTokens } from '../document/model'
export function resolveStyle(node: BuilderNode, target: BuilderTarget): StyleTokens {
  return { ...node.style, ...(node.responsive?.[target] ?? {}) }
}
export function direction(node: BuilderNode): 'row' | 'column' {
  return node.props.direction === 'horizontal' ? 'row' : 'column'
}
