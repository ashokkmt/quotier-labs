import type { Command } from "./types"

export class AddSectionCommand implements Command {
  constructor(public prevDoc: any, public nextDoc: any) {}
  apply() { return this.nextDoc }
  invert() { return new DeleteSectionCommand(this.nextDoc, this.prevDoc) }
  description() { return "Add Section" }
}

export class DeleteSectionCommand implements Command {
  constructor(public prevDoc: any, public nextDoc: any) {}
  apply() { return this.nextDoc }
  invert() { return new AddSectionCommand(this.nextDoc, this.prevDoc) }
  description() { return "Delete Section" }
}

export class MoveSectionCommand implements Command {
  constructor(public prevDoc: any, public nextDoc: any) {}
  apply() { return this.nextDoc }
  invert() { return new MoveSectionCommand(this.nextDoc, this.prevDoc) }
  description() { return "Move Section" }
}

export class DuplicateSectionCommand implements Command {
  constructor(public prevDoc: any, public nextDoc: any) {}
  apply() { return this.nextDoc }
  invert() { return new DeleteSectionCommand(this.nextDoc, this.prevDoc) }
  description() { return "Duplicate Section" }
}

export class ToggleSectionVisibilityCommand implements Command {
  constructor(public prevDoc: any, public nextDoc: any) {}
  apply() { return this.nextDoc }
  invert() { return new ToggleSectionVisibilityCommand(this.nextDoc, this.prevDoc) }
  description() { return "Toggle Section Visibility" }
}

export class UpdateSectionTitleCommand implements Command {
  constructor(public prevDoc: any, public nextDoc: any) {}
  apply() { return this.nextDoc }
  invert() { return new UpdateSectionTitleCommand(this.nextDoc, this.prevDoc) }
  description() { return "Update Section Title" }
}
