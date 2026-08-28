import { describe, expect, it } from 'vitest'
import { placeBlock } from './placement'
import type { Block } from './block'

const widget = (id: string): Block => ({
  id,
  kind: 'section',
  widget_type: 'text',
  children: [],
  visible: true,
  optional: false,
})
const container = (id: string, children: Block[] = []): Block => ({
  id,
  kind: 'section',
  widget_type: 'container',
  children,
  visible: true,
  optional: false,
  layout: { direction: 'vertical' },
})

describe('placement', () => {
  it('adds widgets directly to the implicit root', () =>
    expect(placeBlock([], widget('heading'))).toEqual([widget('heading')]))
  it('creates a horizontal wrapper for a side drop', () => {
    const result = placeBlock([widget('a')], widget('b'), { targetId: 'a', side: 'right' })
    expect(result?.[0].widget_type).toBe('container')
    expect(result?.[0].layout?.direction).toBe('horizontal')
    expect(result?.[0].children.map((child) => child.id)).toEqual(['a', 'b'])
  })
  it('inserts into an existing horizontal container without nesting another one', () => {
    const parent = container('parent', [widget('a'), widget('b')])
    parent.layout = { direction: 'horizontal' }
    const result = placeBlock([parent], widget('c'), { targetId: 'b', side: 'right' })
    expect(result?.[0].children.map((child) => child.id)).toEqual(['a', 'b', 'c'])
    expect(result?.[0].children[0].widget_type).toBe('text')
  })
})
