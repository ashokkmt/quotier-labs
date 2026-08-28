import { describe, expect, it } from 'vitest'
import { alignmentGuides, predictPlacement } from './placement'
import type { BuilderNode } from '../document/model'

const node = (id: string): BuilderNode => ({
  id,
  kind: 'section',
  widget: 'field.text',
  parentId: 'root',
  children: [],
  props: {},
  style: {},
  meta: { visible: true, optional: false },
})
describe('engine geometry placement', () => {
  it('predicts insertion along the container axis', () => {
    const parent = { ...node('p'), widget: 'container', props: { direction: 'horizontal' } }
    expect(
      predictPlacement(
        parent,
        [node('a'), node('b')],
        {
          a: { left: 0, top: 0, width: 50, height: 20 },
          b: { left: 50, top: 0, width: 50, height: 20 },
        },
        { x: 10, y: 5 },
      ),
    ).toMatchObject({ intent: 'before', index: 0, parentId: 'p' })
  })
  it('returns nearby edge and center guides', () => {
    expect(
      alignmentGuides({ left: 1, top: 10, width: 20, height: 10 }, [
        { left: 1, top: 50, width: 20, height: 10 },
      ]),
    ).toEqual(
      expect.arrayContaining([
        { axis: 'x', position: 1 },
        { axis: 'x', position: 21 },
      ]),
    )
  })
})
