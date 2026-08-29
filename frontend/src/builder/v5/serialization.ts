import { validateV5, type V5Document } from './model'

export function parseV5(input: string): V5Document {
  const value = JSON.parse(input) as V5Document
  const error = validateV5(value)
  if (error) throw new Error(`invalid V5 document: ${error}`)
  return value
}

export function serializeV5(document: V5Document): string {
  const error = validateV5(document)
  if (error) throw new Error(`cannot serialize invalid V5 document: ${error}`)
  return JSON.stringify(document)
}
