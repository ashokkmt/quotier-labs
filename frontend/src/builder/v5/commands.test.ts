import { describe, expect, it } from 'vitest'
import { emptyV5Fixture } from './fixtures'
import {
  addPage,
  alignNodes,
  alignToPage,
  deleteNodes,
  deletePage,
  duplicateAndMove,
  duplicatePage,
  distributeNodes,
  groupNodes,
  insertNode,
  insertStoryFrame,
  deleteNode,
  moveNodes,
  reorderExtreme,
  reorderNode,
  reorderPage,
  reparentNode,
  resizeGeometry,
  resizeNode,
  rotateNode,
  setNodeLocked,
  ungroupNode,
  updateNodeGeometry,
  updateNodeGeometryAndProps,
  updateNodeProps,
  updateTextContentAndGeometry,
  updateTableContent,
} from './commands'
import { V5Session } from './store'
import { du } from './model'
import { bounds, corners } from './geometry'
import { createBlankTable, tableHeightDU } from './table'

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
  it('preserves authored text case and whitespace exactly', () => {
    const session = new V5Session(emptyV5Fixture())
    session.execute(insertNode('page-1', { ...node('text'), props: { text: 'Heading' } }))
    session.execute(updateNodeProps('text', { text: '  hello\nworld  ' }))
    expect(session.getSnapshot().document.root.pages[0].children[0].props?.text).toBe(
      '  hello\nworld  ',
    )
  })

  it('keeps a text selection frame large enough for its painted line', () => {
    const session = new V5Session(emptyV5Fixture())
    session.execute(
      insertNode('page-1', {
        ...node('text'),
        geometry: { ...node('text').geometry, height: 200 },
        props: { text: 'Heading', fontSize: 11 },
      }),
    )
    session.execute(updateNodeProps('text', { fontSize: 36, verticalAlign: 'bottom' }))
    const text = session.getSnapshot().document.root.pages[0].children[0]
    expect(text.geometry.height).toBe(Math.round((36 * 1.2 + 2) * 100))
    expect(text.props?.verticalAlign).toBe('bottom')
    session.undo()
    expect(session.getSnapshot().document.root.pages[0].children[0].geometry.height).toBe(200)
  })

  it('commits text and its derived frame atomically and persists explicit width mode', () => {
    const session = new V5Session(emptyV5Fixture())
    session.execute(
      insertNode('page-1', {
        ...node('text'),
        layout_mode: 'intrinsic',
        props: { text: 'Heading', sizingMode: 'auto-width' },
      }),
    )
    const before = session.getSnapshot().document.root.pages[0].children[0]
    const frame = { ...before.geometry, width: du(75), height: du(40) }
    session.execute(updateTextContentAndGeometry('text', 'Heading\nagain', frame))
    expect(session.getSnapshot().document.root.pages[0].children[0]).toMatchObject({
      geometry: frame,
      props: { text: 'Heading\nagain' },
    })
    session.undo()
    expect(session.getSnapshot().document.root.pages[0].children[0]).toMatchObject({
      geometry: before.geometry,
      props: { text: 'Heading' },
    })

    session.execute(updateNodeGeometryAndProps('text', frame, { sizingMode: 'fixed-width' }))
    expect(session.getSnapshot().document.root.pages[0].children[0].props?.sizingMode).toBe(
      'fixed-width',
    )
  })

  it('updates blank table structure and derived height atomically', () => {
    const session = new V5Session(emptyV5Fixture())
    const table = createBlankTable(2, 2, 32000)
    session.execute(
      insertStoryFrame(
        'page-1',
        {
          id: 'table',
          kind: 'flow-frame',
          role: 'flow-frame',
          story_id: 'story',
          geometry: { x: 0, y: 0, width: 32000, height: tableHeightDU(table), rotation: 0 },
          layout_mode: 'flow-frame',
          locked: false,
          visibility: 'shown',
          optional: false,
        },
        { id: 'story', kind: 'table', content: table },
      ),
    )
    const next = { ...table, rows: [...table.rows, ['', '']], row_height_mm: 9 }
    session.execute(updateTableContent('table', next))
    const snapshot = session.getSnapshot()
    expect(snapshot.document.root.pages[0].children[0].geometry.height).toBe(tableHeightDU(next))
    expect(snapshot.document.stories?.[0].content).toMatchObject({
      header_enabled: false,
      column_count: 2,
      row_height_mm: 9,
    })
    const narrower = {
      ...next,
      column_count: 1,
      headers: next.headers.slice(0, 1),
      rows: next.rows.map((row) => row.slice(0, 1)),
      column_widths: next.column_widths.slice(0, 1),
    }
    session.execute(updateTableContent('table', narrower))
    expect(session.getSnapshot().document.root.pages[0].children[0].geometry.width).toBe(
      narrower.column_widths[0],
    )
    session.undo()
    expect(session.getSnapshot().document.root.pages[0].children[0].geometry.width).toBe(
      next.column_widths.reduce((total, width) => total + width, 0),
    )
    expect(session.getSnapshot().document.root.pages[0].children[0].geometry.height).toBe(
      tableHeightDU(table),
    )
  })

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
    session.execute(rotateNode('a', 540, false))
    expect(session.getSnapshot().document.root.pages[0].children[0].geometry.rotation).toBe(-18000)
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

  it('preserves image aspect ratio from all eight resize handles', () => {
    const original = { x: 1000, y: 2000, width: 12000, height: 6000, rotation: 0 }
    const deltas = {
      nw: [-1200, -600],
      n: [0, -600],
      ne: [1200, -600],
      e: [1200, 0],
      se: [1200, 600],
      s: [0, 600],
      sw: [-1200, 600],
      w: [-1200, 0],
    } as const

    for (const [handle, [dx, dy]] of Object.entries(deltas)) {
      const resized = resizeGeometry(original, handle as keyof typeof deltas, dx, dy, {
        preserveAspect: true,
      })
      expect(resized.width / resized.height, handle).toBe(2)
      if (handle === 'n' || handle === 's')
        expect(resized.x + resized.width / 2, handle).toBe(original.x + original.width / 2)
      if (handle === 'e' || handle === 'w')
        expect(resized.y + resized.height / 2, handle).toBe(original.y + original.height / 2)
    }
  })
})

describe('V5 page commands', () => {
  const setup = () => {
    const doc = emptyV5Fixture()
    doc.root.pages[0].child_ids = ['box']
    doc.root.pages[0].children = [
      {
        id: 'box',
        kind: 'shape',
        role: 'element',
        geometry: { x: 1000, y: 1000, width: 5000, height: 5000, rotation: 0 },
        layout_mode: 'fixed',
        locked: false,
        visibility: 'shown',
        optional: false,
      },
    ]
    return doc
  }
  it('adds, reorders, and refuses to delete the last page', () => {
    const session = new V5Session(setup())
    session.execute(addPage('page-2', 'portrait'))
    expect(session.getSnapshot().document.root.pages).toHaveLength(2)
    session.execute(reorderPage('page-2', 0))
    expect(session.getSnapshot().document.root.pages[0].id).toBe('page-2')
    session.execute(deletePage('page-2'))
    expect(() =>
      session.execute(deletePage(session.getSnapshot().document.root.pages[0].id)),
    ).toThrow()
    expect(session.getSnapshot().document.root.pages).toHaveLength(1)
  })
  it('duplicates a page with fresh IDs and remapped stories', () => {
    const doc = setup()
    doc.stories = [{ id: 'story', kind: 'rich-text', content: { text: 'hi' } }]
    doc.root.pages[0].children.push({
      id: 'frame',
      kind: 'flow-frame',
      role: 'flow-frame',
      story_id: 'story',
      geometry: { x: 1000, y: 8000, width: 5000, height: 5000, rotation: 0 },
      layout_mode: 'flow-frame',
      locked: false,
      visibility: 'shown',
      optional: false,
    })
    doc.root.pages[0].child_ids = ['box', 'frame']
    const session = new V5Session(doc)
    const used: string[] = []
    session.execute(
      duplicatePage(doc.root.pages[0].id, 'page-2', (prefix) => {
        const id = `${prefix}-dup-${used.length}`
        used.push(id)
        return id
      }),
    )
    const pages = session.getSnapshot().document.root.pages
    expect(pages).toHaveLength(2)
    expect(pages[1].children.map((node) => node.id)).not.toContain('box')
    const clone = pages[1].children.find((node) => node.role === 'flow-frame')
    const cloneStories = session.getSnapshot().document.stories ?? []
    expect(cloneStories).toHaveLength(2)
    expect(clone?.story_id).not.toBe('story')
    expect(cloneStories.some((story) => story.id === clone?.story_id)).toBe(true)
  })
})

describe('V5 clipboard + duplicate commands', () => {
  const setup = () => {
    const doc = emptyV5Fixture()
    doc.root.pages[0].child_ids = ['a', 'b']
    doc.root.pages[0].children = ['a', 'b'].map((id) => ({
      id,
      kind: 'shape',
      role: 'element',
      geometry: { x: 1000, y: 1000, width: 4000, height: 3000, rotation: 0 },
      layout_mode: 'fixed',
      locked: false,
      visibility: 'shown',
      optional: false,
    }))
    return doc
  }
  it('copies, pastes with fresh ids and valid placement, and selects the clones', () => {
    const session = new V5Session(setup())
    session.selectNode('a')
    expect(session.copySelection()).toBe(1)
    const pasted = session.paste('standard')
    expect(pasted).toHaveLength(1)
    const document = session.getSnapshot().document
    const pastedNode = document.root.pages[0].children.find((node) => node.id === pasted[0])
    expect(pastedNode).toBeDefined()
    expect(pastedNode!.geometry.x).toBeGreaterThan(0)
    expect(session.getSnapshot().selectedNodeIds).toEqual(pasted)
  })
  it('rejects in-place paste when the original does not fit and leaves the document safe', () => {
    const session = new V5Session(setup())
    session.selectNode('a')
    session.execute(
      updateNodeGeometry('a', {
        ...session.getSnapshot().document.root.pages[0].children[0].geometry,
        x: 58000,
        width: 4000,
      }),
    )
    session.copySelection()
    expect(() => session.paste('in-place')).toThrow()
    expect(session.getSnapshot().document.root.pages[0].children).toHaveLength(2)
  })
  it('cut copies then removes in one flow and paste restores it', () => {
    const session = new V5Session(setup())
    session.selectNode('a')
    expect(session.cutSelection()).toBe(1)
    expect(session.getSnapshot().document.root.pages[0].children).toHaveLength(1)
    expect(session.paste('standard')).toHaveLength(1)
    expect(session.getSnapshot().document.root.pages[0].children).toHaveLength(2)
  })
  it('duplicateAndMove creates moved clones in one command', () => {
    const session = new V5Session(setup())
    const before = session.getSnapshot().revision
    session.execute(duplicateAndMove(['a'], 1200, 0, (prefix) => `${prefix}-x`))
    const children = session.getSnapshot().document.root.pages[0].children
    expect(children).toHaveLength(3)
    expect(session.getSnapshot().revision).toBe(before + 1)
    const clone = children.find((node) => node.id === 'node-x')
    expect(clone?.geometry.x).toBe(2200)
  })
  it('rejects moving a selection that contains a locked member atomically', () => {
    const session = new V5Session(setup())
    session.execute(setNodeLocked('a', true))
    expect(() => session.execute(moveNodes(['a', 'b'], 500, 0))).toThrow(/locked/)
    const children = session.getSnapshot().document.root.pages[0].children
    expect(children.find((node) => node.id === 'b')?.geometry.x).toBe(1000)
  })
  it('blocks mutation of children inside a locked group', () => {
    const doc = setup()
    doc.root.pages[0].children = [
      {
        id: 'group',
        kind: 'group',
        role: 'group',
        geometry: { x: 0, y: 0, width: 20000, height: 20000, rotation: 0 },
        layout_mode: 'fixed',
        locked: true,
        visibility: 'shown',
        optional: false,
        child_ids: ['inner'],
        children: [
          {
            id: 'inner',
            kind: 'shape',
            role: 'element',
            geometry: { x: 1000, y: 1000, width: 4000, height: 3000, rotation: 0 },
            layout_mode: 'fixed',
            locked: false,
            visibility: 'shown',
            optional: false,
          },
        ],
      },
    ]
    doc.root.pages[0].child_ids = ['group']
    const session = new V5Session(doc)
    expect(() => session.execute(moveNodes(['inner'], 500, 0))).toThrow(/locked/)
    expect(() => session.execute(deleteNode('inner'))).toThrow(/locked/)
    expect(() => session.execute(rotateNode('inner', 45, false))).toThrow(/locked/)
  })
  it('reorderExtreme moves nodes to the ends of the sibling list', () => {
    const session = new V5Session(setup())
    session.execute(reorderExtreme('a', 'front'))
    expect(session.getSnapshot().document.root.pages[0].child_ids).toEqual(['b', 'a'])
    session.execute(reorderExtreme('a', 'back'))
    expect(session.getSnapshot().document.root.pages[0].child_ids).toEqual(['a', 'b'])
  })
})

describe('flow frame duplication stories (tools.md §21–22)', () => {
  const frameDoc = () => {
    const doc = emptyV5Fixture()
    doc.stories = [{ id: 'story', kind: 'rich-text', content: { text: 'hello' } }]
    doc.root.pages[0].child_ids = ['auto', 'manual']
    doc.root.pages[0].children = [
      {
        id: 'auto',
        kind: 'flow-frame',
        role: 'flow-frame',
        story_id: 'story',
        continuation: 'auto-pages',
        geometry: { x: 1000, y: 1000, width: 5000, height: 5000, rotation: 0 },
        layout_mode: 'flow-frame',
        locked: false,
        visibility: 'shown',
        optional: false,
      },
      {
        id: 'manual',
        kind: 'flow-frame',
        role: 'flow-frame',
        story_id: 'story',
        continuation: 'manual',
        geometry: { x: 1000, y: 8000, width: 5000, height: 5000, rotation: 0 },
        layout_mode: 'flow-frame',
        locked: false,
        visibility: 'shown',
        optional: false,
      },
    ]
    return doc
  }
  it('deep-copies the story for an auto frame and keeps manual frames linked', () => {
    const session = new V5Session(frameDoc())
    session.execute(duplicateAndMove(['auto'], 1200, 0, (prefix) => `${prefix}-auto-clone`))
    const state = session.getSnapshot().document
    expect(state.stories).toHaveLength(2)
    const clone = state.root.pages[0].children.find((node) => node.id === 'node-auto-clone')
    expect(clone?.story_id).not.toBe('story')
    session.execute(duplicateAndMove(['manual'], 0, 1200, (prefix) => `${prefix}-manual-clone`))
    const after = session.getSnapshot().document
    expect(after.stories).toHaveLength(2)
    const manualClone = after.root.pages[0].children.find((node) => node.id === 'node-manual-clone')
    expect(manualClone?.story_id).toBe('story')
  })
})

describe('align to printable area (tools.md §24)', () => {
  it('aligns a single object relative to the printable area', () => {
    const doc = emptyV5Fixture()
    doc.root.pages[0].margin = { top: du(1000), right: du(1000), bottom: du(1000), left: du(1000) }
    doc.root.pages[0].child_ids = ['a']
    doc.root.pages[0].children = [
      {
        id: 'a',
        kind: 'shape',
        role: 'element',
        geometry: { x: 30000, y: 30000, width: 5000, height: 5000, rotation: 0 },
        layout_mode: 'fixed',
        locked: false,
        visibility: 'shown',
        optional: false,
      },
    ]
    const session = new V5Session(doc)
    session.execute(alignToPage('a', 'left'))
    expect(session.getSnapshot().document.root.pages[0].children[0].geometry.x).toBe(du(1000))
    session.execute(alignToPage('a', 'right'))
    expect(session.getSnapshot().document.root.pages[0].children[0].geometry.x).toBe(
      59528 - 1000 - 5000,
    )
    session.execute(alignToPage('a', 'center-y'))
    const geometry = session.getSnapshot().document.root.pages[0].children[0].geometry
    expect(geometry.y).toBe(du(1000 + (84189 - 2000 - 5000) / 2))
  })

  it('aligns the visible bounds of rotated objects', () => {
    const doc = emptyV5Fixture()
    doc.root.pages[0].margin = { top: 1000, right: 1000, bottom: 1000, left: 1000 }
    doc.root.pages[0].child_ids = ['a', 'b', 'c']
    doc.root.pages[0].children = [
      {
        ...node('a'),
        geometry: { x: 30000, y: 30000, width: 5000, height: 10000, rotation: 9000 },
      },
      { ...node('b'), geometry: { x: 45000, y: 30000, width: 5000, height: 5000, rotation: 0 } },
      { ...node('c'), geometry: { x: 56000, y: 30000, width: 4000, height: 8000, rotation: 9000 } },
    ]
    const session = new V5Session(doc)
    session.execute(alignToPage('a', 'left'))
    let nodes = session.getSnapshot().document.root.pages[0].children
    expect(bounds(corners(nodes[0].geometry)).x).toBe(1000)

    session.execute(alignNodes(['a', 'b'], 'top'))
    nodes = session.getSnapshot().document.root.pages[0].children
    expect(bounds(corners(nodes[0].geometry)).y).toBe(bounds(corners(nodes[1].geometry)).y)

    session.execute(distributeNodes(['a', 'b', 'c'], 'x'))
    nodes = session.getSnapshot().document.root.pages[0].children
    const ordered = nodes.map((item) => bounds(corners(item.geometry))).sort((a, b) => a.x - b.x)
    expect(ordered[1].x - (ordered[0].x + ordered[0].width)).toBe(
      ordered[2].x - (ordered[1].x + ordered[1].width),
    )
  })
})

describe('atomic selection delete (tools.md §23)', () => {
  it('removes a whole selection in one history entry and restores it with one undo', () => {
    const doc = emptyV5Fixture()
    doc.root.pages[0].child_ids = ['a', 'b']
    doc.root.pages[0].children = ['a', 'b'].map((id) => ({
      id,
      kind: 'shape',
      role: 'element',
      geometry: { x: du(1000), y: du(1000), width: du(4000), height: du(3000), rotation: 0 },
      layout_mode: 'fixed',
      locked: false,
      visibility: 'shown',
      optional: false,
    }))
    const session = new V5Session(doc)
    const before = session.getSnapshot().revision
    session.execute(deleteNodes(['a', 'b']))
    expect(session.getSnapshot().document.root.pages[0].children).toHaveLength(0)
    expect(session.getSnapshot().revision).toBe(before + 1)
    session.undo()
    expect(session.getSnapshot().document.root.pages[0].children).toHaveLength(2)
  })

  it('garbage-collects stories only after their last frame is deleted', () => {
    const doc = emptyV5Fixture()
    doc.stories = [{ id: 'story', kind: 'rich-text', content: { text: 'hello' } }]
    doc.root.pages[0].child_ids = ['first', 'second']
    doc.root.pages[0].children = ['first', 'second'].map((id) => ({
      ...node(id),
      kind: 'flow-frame',
      role: 'flow-frame' as const,
      layout_mode: 'flow-frame' as const,
      story_id: 'story',
    }))
    const session = new V5Session(doc)
    session.execute(deleteNode('first'))
    expect(session.getSnapshot().document.stories).toHaveLength(1)
    session.execute(deleteNode('second'))
    expect(session.getSnapshot().document.stories).toHaveLength(0)
    session.undo()
    expect(session.getSnapshot().document.stories).toHaveLength(1)
  })
})

describe('reparenting preserves page-space geometry', () => {
  it('moves a child out of a rotated group without a visual jump', () => {
    const doc = emptyV5Fixture()
    doc.root.pages[0].children = [
      {
        id: 'group',
        kind: 'group',
        role: 'group',
        geometry: { x: 1000, y: 1000, width: 10000, height: 10000, rotation: 9000 },
        layout_mode: 'fixed',
        locked: false,
        visibility: 'shown',
        optional: false,
        child_ids: ['child'],
        children: [
          {
            id: 'child',
            kind: 'shape',
            role: 'element',
            geometry: { x: 100, y: 200, width: 1000, height: 1000, rotation: 0 },
            layout_mode: 'fixed',
            locked: false,
            visibility: 'shown',
            optional: false,
          },
        ],
      },
    ]
    doc.root.pages[0].child_ids = ['group']
    const session = new V5Session(doc)
    session.execute(reparentNode('child', null))
    const child = session
      .getSnapshot()
      .document.root.pages[0].children.find((item) => item.id === 'child')!
    expect(child.geometry.x).toBe(9800)
    expect(child.geometry.y).toBe(1100)
    expect(child.geometry.rotation).toBe(9000)
    expect(session.getSnapshot().document.root.pages[0].children[0].child_ids).toEqual([])
  })
})
