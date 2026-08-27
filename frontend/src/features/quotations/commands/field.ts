import type { Command } from "./types"

export class UpdateFieldValueCommand implements Command {
  constructor(
    public prevDoc: any,
    public nextDoc: any,
    public timestamp: number = Date.now()
  ) {}

  apply(_doc: any) { return this.nextDoc }
  invert() { return new UpdateFieldValueCommand(this.nextDoc, this.prevDoc, this.timestamp) }
  description() { return "Update Field Value" }

  coalesce(other: Command): boolean {
    if (other instanceof UpdateFieldValueCommand) {
      if (Math.abs(this.timestamp - other.timestamp) < 500) {
        this.nextDoc = other.nextDoc
        this.timestamp = other.timestamp
        return true
      }
    }
    return false
  }
}

export class AddFieldCommand implements Command {
  constructor(public prevDoc: any, public nextDoc: any) {}
  apply() { return this.nextDoc }
  invert() { return new DeleteFieldCommand(this.nextDoc, this.prevDoc) }
  description() { return "Add Field" }
}

export class DeleteFieldCommand implements Command {
  constructor(public prevDoc: any, public nextDoc: any) {}
  apply() { return this.nextDoc }
  invert() { return new AddFieldCommand(this.nextDoc, this.prevDoc) }
  description() { return "Delete Field" }
}
