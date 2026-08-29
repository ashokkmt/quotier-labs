import { describe, expect, it } from 'vitest'
import {
  A4_HEIGHT_DU,
  A4_WIDTH_DU,
  du,
  validateV5,
  V5_SCHEMA_VERSION,
  type V5Document,
} from './model'
import { parseV5, serializeV5 } from './serialization'
import { largeTableFixture } from './fixtures'

const fixture = (): V5Document => ({
  schema_version: V5_SCHEMA_VERSION,
  settings: { page_size: 'A4', orientation: 'portrait' },
  root: {
    pages: [
      {
        id: 'p1',
        width: du(A4_WIDTH_DU),
        height: du(A4_HEIGHT_DU),
        margin: { top: du(0), right: du(0), bottom: du(0), left: du(0) },
        child_ids: [],
        children: [],
      },
    ],
  },
})

describe('V5 model', () => {
  it('validates and round-trips a page fixture', () =>
    expect(parseV5(serializeV5(fixture())).schema_version).toBe(5))
  it('rejects non-A4 geometry', () =>
    expect(
      validateV5({ ...fixture(), root: { pages: [{ ...fixture().root.pages[0], width: du(1) }] } }),
    ).toContain('dimensions'))
  it('provides the 500-row baseline fixture without editor state', () =>
    expect((largeTableFixture().stories?.[0].content as { rows: unknown[] }).rows).toHaveLength(
      500,
    ))
})
