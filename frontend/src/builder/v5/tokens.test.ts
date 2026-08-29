import { describe, expect, it } from 'vitest'
import {
  clampFontSize,
  clampStrokeWidth,
  defaultShapeProps,
  defaultTextProps,
  isColorToken,
  V5_COLOR_TOKENS,
  V5_TOOL_PRESETS,
} from './tokens'
import { getV5Widget, validateNodeContract } from './registry'
import { du, type V5Node } from './model'

describe('V5 design tokens', () => {
  it('uses a closed token palette', () => {
    expect([...V5_COLOR_TOKENS].sort()).toEqual([
      'black',
      'danger',
      'gray',
      'primary',
      'success',
      'white',
    ])
    expect(isColorToken('black')).toBe(true)
    expect(isColorToken('#ff00ff')).toBe(false)
    expect(isColorToken('none')).toBe(false)
  })
  it('clamps font size and stroke width into controlled bounds', () => {
    expect(clampFontSize(500)).toBe(72)
    expect(clampFontSize(2)).toBe(6)
    expect(clampStrokeWidth(99)).toBe(12)
    expect(clampStrokeWidth(0.1)).toBe(0.25)
  })
  it('every tool preset references a registered widget with valid props', () => {
    for (const preset of V5_TOOL_PRESETS) {
      expect(getV5Widget(preset.kind), preset.id).toBeDefined()
      const node: V5Node = {
        id: 'probe',
        kind: preset.kind,
        role: preset.role,
        geometry: { x: 0, y: 0, width: preset.size.width, height: preset.size.height, rotation: 0 },
        layout_mode: preset.layoutMode,
        locked: false,
        visibility: 'shown',
        optional: false,
        props: preset.props,
        story_id: preset.role === 'flow-frame' ? 'story' : undefined,
      }
      expect(validateNodeContract(node), preset.id).toBeNull()
    }
  })
  it('shape defaults stay within controlled enums', () => {
    const shape = defaultShapeProps()
    expect(
      shape.variant === 'rect' || shape.variant === 'ellipse' || shape.variant === 'line',
    ).toBe(true)
    expect(
      shape.strokeStyle === 'solid' ||
        shape.strokeStyle === 'dashed' ||
        shape.strokeStyle === 'dotted',
    ).toBe(true)
    const text = defaultTextProps()
    expect(text.color).toBe('black')
    expect(clampFontSize(text.fontSize)).toBe(text.fontSize)
    expect(du(1.5)).toBe(2)
  })
})
