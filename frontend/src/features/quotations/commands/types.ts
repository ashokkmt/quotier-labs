export interface Command {
  apply(document: any): any
  invert(): Command
  description(): string
  coalesce?(other: Command): boolean
}
