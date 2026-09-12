import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { v6Extensions } from './extensions'
import { setTextStyleAttribute, uniformValue } from './selectionState'

describe('V6 mixed selection state', () => {
  it('returns one value for uniform and mixed for differing selections', () => {
    expect(uniformValue([], 'Normal')).toBe('Normal')
    expect(uniformValue(['Body', 'Body'], 'Normal')).toBe('Body')
    expect(uniformValue(['Body', 'Terms'], 'Normal')).toBe('mixed')
    expect(uniformValue([true, false], false)).toBe('mixed')
  })

  it('changes one character attribute without flattening other mixed formatting', () => {
    const editor = new Editor({
      extensions: v6Extensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { id: 'p' },
            content: [
              {
                type: 'text',
                text: 'A',
                marks: [{ type: 'textStyle', attrs: { color: '#111111', fontSize: 1000 } }],
              },
              {
                type: 'text',
                text: 'B',
                marks: [{ type: 'textStyle', attrs: { color: '#222222', fontSize: 1200 } }],
              },
            ],
          },
        ],
      },
    })
    editor.commands.setTextSelection({ from: 1, to: 3 })
    setTextStyleAttribute(editor, 'fontFamily', 'Quotier Serif')
    const content = editor.getJSON().content![0].content!
    expect(content[0].marks![0].attrs).toMatchObject({
      color: '#111111',
      fontSize: 1000,
      fontFamily: 'Quotier Serif',
    })
    expect(content[1].marks![0].attrs).toMatchObject({
      color: '#222222',
      fontSize: 1200,
      fontFamily: 'Quotier Serif',
    })
    editor.destroy()
  })
})
