import { describe, expect, it } from 'vitest'
import { emptyV5Fixture } from './fixtures'
import {
  groupNodes,
  insertNode,
  deleteNode,
  moveNodes,
  reorderNode,
  resizeGeometry,
  resizeNode,
  rotateNode,
  setNodeLocked,
  ungroupNode,
  updateNodeGeometry,
} from './commands'
import { V5Session } from './store'
import { du } from './model'

const node = (id: string) => ({
  id,
  kind: 'text',
  role: 'element' as const,
  geometry: { x: du(0), y: du(0), width: du(100), height: du(50), rotation: 0 },
  layout_mode: 'fixed' as const,
  locked: false,
  visibility: 'shown' as const,
  optional: false,
})

describe('V5 document commands', () => {
  it('supports insert, reorder, geometry, lock, delete and exact undo', () => {
    const session = new V5Session(emptyV5Fixture())
    session.execute(insertNode('page-1', node('a')))
    session.execute(insertNode('page-1', node('b')))
    session.execute(reorderNode('a', 1))
    session.execute(updateNodeGeometry('b', { ...node('b').geometry, x: du(300) }))
    session.execute(setNodeLocked('b', true))
    expect(session.getSnapshot().document.root.pages[0].children.map((n) => n.id)).toEqual([
      'b',
      'a',
    ])
    expect(session.getSnapshot().document.root.pages[0].children[0].locked).toBe(true)
    session.undo()
    expect(session.getSnapshot().document.root.pages[0].children[0].locked).toBe(false)
    session.execute(deleteNode('a'))
    expect(session.getSnapshot().document.root.pages[0].children).toHaveLength(1)
    session.undo()
    expect(session.getSnapshot().document.root.pages[0].children).toHaveLength(2)
  })

  it('quantizes move, resize, rotate, group and ungroup operations with undo', () => {
    const session = new V5Session(emptyV5Fixture())
    session.execute(
      insertNode('page-1', {
        ...node('a'),
        geometry: { ...node('a').geometry, x: du(100), y: du(200) },
      }),
    )
    session.execute(
      insertNode('page-1', {
        ...node('b'),
        geometry: { ...node('b').geometry, x: du(400), y: du(200) },
      }),
    )
    session.execute(moveNodes(['a', 'b'], 40.4, -10.6))
    expect(session.getSnapshot().document.root.pages[0].children[0].geometry.x).toBe(140)
    expect(
      resizeGeometry(node('a').geometry, 'nw', 50, 10, { preserveAspect: true }).width,
    ).toBeGreaterThan(0)
    session.execute(resizeNode('a', 'se', 25.4, 30.9))
    session.execute(rotateNode('a', 17, true))
    expect(session.getSnapshot().document.root.pages[0].children[0].geometry.rotation).toBe(1500)
    session.execute(groupNodes('page-1', ['a', 'b'], 'group-1'))
    expect(session.getSnapshot().document.root.pages[0].children[0].id).toBe('group-1')
    session.execute(ungroupNode('group-1'))
    expect(session.getSnapshot().document.root.pages[0].children.map((n) => n.id)).toEqual([
      'a',
      'b',
    ])
    session.undo()
    expect(session.getSnapshot().document.root.pages[0].children[0].id).toBe('group-1')
  })
})
