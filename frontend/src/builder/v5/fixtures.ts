import { A4_HEIGHT_DU, A4_WIDTH_DU, du, type V5Document } from './model'

export function emptyV5Fixture(): V5Document {
  return {
    schema_version: 5,
    settings: { page_size: 'A4', orientation: 'portrait' },
    root: {
      pages: [
        {
          id: 'page-1',
          width: du(A4_WIDTH_DU),
          height: du(A4_HEIGHT_DU),
          margin: { top: du(0), right: du(0), bottom: du(0), left: du(0) },
          child_ids: [],
          children: [],
        },
      ],
    },
  }
}

export function largeTableFixture(rowCount = 500) {
  return {
    ...emptyV5Fixture(),
    stories: [
      {
        id: 'table-1',
        kind: 'table' as const,
        content: {
          headers: ['', ''],
          rows: Array.from({ length: rowCount }, () => ['', '']),
          column_count: 2,
          header_enabled: false,
          repeat_header: false,
          row_height_mm: 8,
          column_widths: [16000, 16000],
        },
      },
    ],
  }
}
