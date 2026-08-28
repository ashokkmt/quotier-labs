import type { Command } from './types'

export class UpdateCellCommand implements Command {
  constructor(
    public prevDoc: any,
    public nextDoc: any,
    public timestamp: number = Date.now(),
  ) {}

  apply(_doc: any) {
    return this.nextDoc
  }
  invert() {
    return new UpdateCellCommand(this.nextDoc, this.prevDoc, this.timestamp)
  }
  description() {
    return 'Update Cell'
  }

  coalesce(other: Command): boolean {
    if (other instanceof UpdateCellCommand) {
      if (Math.abs(this.timestamp - other.timestamp) < 500) {
        this.nextDoc = other.nextDoc
        this.timestamp = other.timestamp
        return true
      }
    }
    return false
  }
}

export class AddTableRowCommand implements Command {
  constructor(
    public prevDoc: any,
    public nextDoc: any,
  ) {}
  apply() {
    return this.nextDoc
  }
  invert() {
    return new DeleteTableRowCommand(this.nextDoc, this.prevDoc)
  }
  description() {
    return 'Add Table Row'
  }
}

export class DeleteTableRowCommand implements Command {
  constructor(
    public prevDoc: any,
    public nextDoc: any,
  ) {}
  apply() {
    return this.nextDoc
  }
  invert() {
    return new AddTableRowCommand(this.nextDoc, this.prevDoc)
  }
  description() {
    return 'Delete Table Row'
  }
}
