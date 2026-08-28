import type { BuilderNode, LayoutProps } from '../document/model'
export function resolveLayout(node: BuilderNode): LayoutProps {
  return { ...node.layout }
}
export function direction(node: BuilderNode): 'row' | 'column' {
  return node.props.direction === 'horizontal' ? 'row' : 'column'
}
