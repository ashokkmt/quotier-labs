import { describe, expect, it } from 'vitest'
import { denormalize, deserialize, normalize, serialize } from './serialization'

describe('builder document serialization', () => {
  it('normalizes and round-trips a nested document', () => {
    const model = normalize({
      schema_version: 3,
      root: {
        id: 'root',
        kind: 'root',
        widget: 'root',
        props: {},
        style: {},
        meta: { visible: true, optional: false },
        children: [
          {
            id: 'c',
            kind: 'section',
            widget: 'container',
            props: { direction: 'horizontal' },
            style: {},
            meta: { visible: true, optional: false },
            children: [
              {
                id: 'h',
                kind: 'section',
                widget: 'field.heading',
                props: { text: 'Hello' },
                style: {},
                meta: { visible: true, optional: false },
                children: [],
              },
            ],
          },
        ],
      },
    })
    const restored = deserialize(serialize(model))
    expect(Object.keys(restored.nodes)).toEqual(['root', 'c', 'h'])
    expect(restored.nodes.h.parentId).toBe('c')
    expect(denormalize(restored).root.children[0].children[0].type).toBe('field.heading')
  })
})
