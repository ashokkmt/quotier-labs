import type { Command } from "./types"

export class SnapshotCommand implements Command {
  constructor(
    public prevDoc: any, 
    public nextDoc: any, 
    public desc: string,
    public timestamp: number = Date.now()
  ) {}

  apply(_doc: any) { return this.nextDoc }
  invert() { return new SnapshotCommand(this.nextDoc, this.prevDoc, `Undo ${this.desc}`, this.timestamp) }
  description() { return this.desc }

  coalesce(other: Command): boolean {
    if (other instanceof SnapshotCommand) {
      if (this.desc === other.desc && Math.abs(this.timestamp - other.timestamp) < 800) {
        this.nextDoc = other.nextDoc
        this.timestamp = other.timestamp
        return true
      }
    }
    return false
  }
}
