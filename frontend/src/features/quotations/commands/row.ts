import type { Command } from './types'

export class AddRowCommand implements Command {
  constructor(
    public prevDoc: any,
    public nextDoc: any,
  ) {}
  apply() {
    return this.nextDoc
  }
  invert() {
    return new DeleteRowCommand(this.nextDoc, this.prevDoc)
  }
  description() {
    return 'Add Row'
  }
}

export class DeleteRowCommand implements Command {
  constructor(
    public prevDoc: any,
    public nextDoc: any,
  ) {}
  apply() {
    return this.nextDoc
  }
  invert() {
    return new AddRowCommand(this.nextDoc, this.prevDoc)
  }
  description() {
    return 'Delete Row'
  }
}

export class MoveRowCommand implements Command {
  constructor(
    public prevDoc: any,
    public nextDoc: any,
  ) {}
  apply() {
    return this.nextDoc
  }
  invert() {
    return new MoveRowCommand(this.nextDoc, this.prevDoc)
  }
  description() {
    return 'Move Row'
  }
}

export class AddColumnCommand implements Command {
  constructor(
    public prevDoc: any,
    public nextDoc: any,
  ) {}
  apply() {
    return this.nextDoc
  }
  invert() {
    return new DeleteColumnCommand(this.nextDoc, this.prevDoc)
  }
  description() {
    return 'Add Column'
  }
}

export class DeleteColumnCommand implements Command {
  constructor(
    public prevDoc: any,
    public nextDoc: any,
  ) {}
  apply() {
    return this.nextDoc
  }
  invert() {
    return new AddColumnCommand(this.nextDoc, this.prevDoc)
  }
  description() {
    return 'Delete Column'
  }
}

export class ResizeColumnCommand implements Command {
  constructor(
    public prevDoc: any,
    public nextDoc: any,
  ) {}
  apply() {
    return this.nextDoc
  }
  invert() {
    return new ResizeColumnCommand(this.nextDoc, this.prevDoc)
  }
  description() {
    return 'Resize Column'
  }
}
