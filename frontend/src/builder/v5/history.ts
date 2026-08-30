import { serializeV5, parseV5 } from './serialization'
import type { V5Document } from './model'

export type V5Command = {
  label: string
  coalesceKey?: string
  apply(document: V5Document): V5Document
  revert(document: V5Document): V5Document
}

/** Pure per-instance history kernel. Commands receive immutable snapshots and are never persisted. */
export class V5History {
  private past: V5Command[] = []
  private future: V5Command[] = []
  private current: V5Document
  private _revision = 0

  constructor(initial: V5Document) {
    this.current = parseV5(serializeV5(initial))
  }
  get document(): V5Document {
    return this.current
  }
  get revision(): number {
    return this._revision
  }
  get canUndo(): boolean {
    return this.past.length > 0
  }
  get canRedo(): boolean {
    return this.future.length > 0
  }

  execute(command: V5Command): V5Document {
    const next = command.apply(this.current)
    parseV5(serializeV5(next))
    this.current = next
    if (command.coalesceKey && this.past.at(-1)?.coalesceKey === command.coalesceKey) {
      const first = this.past[this.past.length - 1]
      // Keep the first inverse while using the latest forward command. Undo now restores the
      // start of the typing/nudge/property session, not merely its penultimate update.
      this.past[this.past.length - 1] = { ...command, revert: first.revert }
    } else this.past.push(command)
    this.future = []
    this._revision++
    return this.current
  }
  undo(): V5Document | null {
    const command = this.past.pop()
    if (!command) return null
    this.current = command.revert(this.current)
    parseV5(serializeV5(this.current))
    this.future.push(command)
    this._revision++
    return this.current
  }
  redo(): V5Document | null {
    const command = this.future.pop()
    if (!command) return null
    this.current = command.apply(this.current)
    parseV5(serializeV5(this.current))
    this.past.push(command)
    this._revision++
    return this.current
  }
}
