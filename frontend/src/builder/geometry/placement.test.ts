import { describe, expect, it } from 'vitest'
import { alignmentGuides, resolvePlacement } from './placement'
import { createRoot } from '../document/model'
describe('engine geometry placement', () => {
  it('predicts insertion along the container axis', () => {
    const document = createRoot('root')
    document.nodes.p = {
      id: 'p',
      role: 'container',
      type: 'container',
      parentId: 'root',
      children: ['a', 'b'],
      props: {},
      layout: { direction: 'horizontal' },
      meta: { visible: true, optional: false },
    }
    document.nodes.a = {
      id: 'a',
      role: 'widget',
      type: 'field.text',
      parentId: 'p',
      children: [],
      props: {},
      layout: {},
      meta: { visible: true, optional: false },
    }
    document.nodes.b = { ...document.nodes.a, id: 'b' }
    document.nodes.root.children = ['p']
    expect(
      resolvePlacement(
        document,
        { type: 'create', widget: 'field.text' },
        {
          p: { left: 0, top: 0, width: 100, height: 20 },
          a: { left: 0, top: 0, width: 50, height: 20 },
          b: { left: 50, top: 0, width: 50, height: 20 },
        },
        { x: 10, y: 5 },
      ),
    ).toMatchObject({ operation: 'insert', index: 0, parentId: 'p' })
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
  it('predicts a horizontal insertion line while hovering the gap between fields', () => {
    const document = createRoot('root')
    document.nodes.p = {
      id: 'p',
      role: 'container',
      type: 'container',
      parentId: 'root',
      children: ['a', 'b'],
      props: {},
      layout: { direction: 'horizontal' },
      meta: { visible: true, optional: false },
    }
    document.nodes.a = {
      id: 'a',
      role: 'widget',
      type: 'field.text',
      parentId: 'p',
      children: [],
      props: {},
      layout: {},
      meta: { visible: true, optional: false },
    }
    document.nodes.b = { ...document.nodes.a, id: 'b' }
    document.nodes.root.children = ['p']
    expect(
      resolvePlacement(
        document,
        { type: 'create', widget: 'image' },
        {
          p: { left: 0, top: 0, width: 120, height: 30 },
          a: { left: 0, top: 0, width: 50, height: 30 },
          b: { left: 70, top: 0, width: 50, height: 30 },
        },
        { x: 60, y: 15 },
      ),
    ).toMatchObject({
      parentId: 'p',
      index: 1,
      preview: 'line',
      axis: 'horizontal',
      linePosition: 'before',
    })
  })
})
