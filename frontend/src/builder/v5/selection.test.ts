import { describe, expect, it } from 'vitest'
import { emptyV5Fixture } from './fixtures'
import { V5Session } from './store'

describe('V5 selection state', () => {
  it('supports additive toggle, group scope, and clearing', () => {
    const s = new V5Session(emptyV5Fixture())
    s.selectNode('a')
    s.selectNode('b', true)
    s.selectNode('a', true)
    expect(s.getSnapshot().selectedNodeIds).toEqual(['b'])
    s.enterGroup('group-1')
    expect(s.getSnapshot().editScopeId).toBe('group-1')
    s.exitGroup()
    expect(s.getSnapshot().editScopeId).toBeNull()
    s.selectNodes([])
    expect(s.getSnapshot().selectedNodeId).toBeNull()
  })
})
