import type { DocumentModel } from '../document/model'
export type Transaction = {
  type: string
  apply: (model: DocumentModel) => DocumentModel
  invert: (model: DocumentModel) => DocumentModel
  coalesceKey?: string
}
export class HistoryEngine {
  private undoStack: Transaction[] = []
  private redoStack: Transaction[] = []
  execute(model: DocumentModel, transaction: Transaction) {
    const next = transaction.apply(model)
    this.undoStack.push(transaction)
    this.redoStack = []
    return next
  }
  undo(model: DocumentModel) {
    const transaction = this.undoStack.pop()
    if (!transaction) return model
    const next = transaction.invert(model)
    this.redoStack.push(transaction)
    return next
  }
  redo(model: DocumentModel) {
    const transaction = this.redoStack.pop()
    if (!transaction) return model
    const next = transaction.apply(model)
    this.undoStack.push(transaction)
    return next
  }
  get canUndo() {
    return this.undoStack.length > 0
  }
  get canRedo() {
    return this.redoStack.length > 0
  }
}
