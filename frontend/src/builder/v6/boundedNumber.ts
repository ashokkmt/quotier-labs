export function boundedNumberValue(draft: string, min: number, max: number) {
  if (draft.trim() === '') return null
  const parsed = Number(draft)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : null
}
