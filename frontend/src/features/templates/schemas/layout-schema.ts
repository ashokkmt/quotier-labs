export type ColumnWidth = '100%' | '50%' | '33%' | '66%'

export interface SectionInstance {
  id: string
  section_definition_id: string
  title_override?: string
  visibility: boolean
  optional: boolean
  field_overrides?: Record<string, any>
  layout_overrides?: Record<string, any>
}

export interface Column {
  id: string
  order: number
  width: ColumnWidth
  sections: SectionInstance[]
}

export interface Row {
  id: string
  order: number
  columns: Column[]
}

export interface Layout {
  rows: Row[]
}
