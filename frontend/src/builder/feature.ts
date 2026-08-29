/** Composition-bound capability flag. It is deliberately off unless explicitly enabled. */
export function isFreeformV5Enabled(): boolean {
  return import.meta.env.VITE_FREEFORM_V5 === 'true'
}
