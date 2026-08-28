import type { Block, FieldType } from "./block"

export type LibraryEntry = { label: string; blockKind?: Block["kind"]; fieldType?: FieldType; sectionDefinitionId?: string; defaultProps?: Record<string, unknown> }
export const blockLibrary: LibraryEntry[] = [
  ...(["Heading", "Text", "Textarea", "Number", "Currency", "Date", "Image"] as FieldType[]).map(fieldType => ({ label: fieldType, fieldType })),
  { label: "Table", defaultProps: { table: true } }, { label: "Section", blockKind: "section" }, { label: "Row", blockKind: "row" }, { label: "Column", blockKind: "column" },
  { label: "Customer Details", sectionDefinitionId: "customer-details" }, { label: "Payment Terms", sectionDefinitionId: "payment-terms" }, { label: "Warranty", sectionDefinitionId: "warranty" }, { label: "Notes", sectionDefinitionId: "notes" }, { label: "Signature", sectionDefinitionId: "signature" }, { label: "Stamp", sectionDefinitionId: "stamp" }
]
export function createLibraryBlock(entry: LibraryEntry, id = crypto.randomUUID()): Block {
  if (entry.fieldType) return { id, kind: "section", children: [], title: entry.label, visible: true, optional: false, fields: [{ id: `${id}-field`, label: entry.label, type: entry.fieldType, required: false }] }
  return { id, kind: entry.blockKind ?? "section", children: [], title: entry.label, section_definition_id: entry.sectionDefinitionId, visible: true, optional: false }
}
