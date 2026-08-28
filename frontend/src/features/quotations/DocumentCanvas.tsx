import { useState } from 'react'
import type { CSSProperties, FocusEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Copy, GripVertical, Columns2 } from 'lucide-react'
import { FieldInput } from './FieldInput'
import { TableEditor } from './TableEditor'
import { BlockLibraryPanel } from './components/BlockLibraryPanel'
import { blockLibrary, createLibraryBlock, type LibraryEntry } from './model/library'
import { canContain, validateChildren, type Block, type DocumentModel } from './model/block'
import { SelectImage } from '../../../wailsjs/go/wails/CompanyHandler'
import { placeBlock, resolveDrop, type DropResolution } from './model/placement'
import { Inspector } from '../../builder/inspector/Inspector'
import type { BuilderNode } from '../../builder/document/model'

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const find = (nodes: Block[], id: string): Block | null => {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = find(node.children, id)
    if (found) return found
  }
  return null
}
const updateTree = (node: Block, id: string, update: (node: Block) => Block): Block =>
  node.id === id
    ? update(node)
    : { ...node, children: node.children.map((child) => updateTree(child, id, update)) }
function remove(nodes: Block[], id: string): [Block[], Block | null] {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return [[...nodes.slice(0, i), ...nodes.slice(i + 1)], nodes[i]]
    const [children, found] = remove(nodes[i].children, id)
    if (found) return [nodes.map((node, n) => (n === i ? { ...node, children } : node)), found]
  }
  return [nodes, null]
}
function insert(nodes: Block[], parentId: string, child: Block, index = -1): Block[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      const children = [...node.children]
      children.splice(index < 0 ? children.length : index, 0, child)
      return { ...node, children }
    }
    return { ...node, children: insert(node.children, parentId, child, index) }
  })
}
function hasDescendant(node: Block | null, id: string): boolean {
  return !!node && (node.id === id || node.children.some((child) => hasDescendant(child, id)))
}

export function DocumentCanvas({
  document,
  onChange,
  readOnly,
  quotation,
}: {
  document: DocumentModel | null
  onChange: (document: DocumentModel) => void
  readOnly: boolean
  quotation?: any
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [copied, setCopied] = useState<Block | null>(null)
  const [dropError, setDropError] = useState('')
  const [dropPreview, setDropPreview] = useState<DropResolution | null>(null)
  if (!document) return null
  const selectedNode = selected ? find(document.children, selected) : null
  const commit = (children: Block[]) => {
    const error = validateChildren(children)
    if (error) {
      setDropError(error)
      return
    }
    setDropError('')
    onChange({ ...document, children })
  }
  const add = (entry: LibraryEntry, targetId?: string, resolution?: DropResolution) => {
    const block = createLibraryBlock(entry)
    const target = targetId ? find(document.children, targetId) : null
    if (target && !canContain(target.kind, block.kind)) {
      setDropError('This element cannot be placed in that location.')
      return
    }
    const children = resolution
      ? placeBlock(document.children, block, resolution)
      : target
        ? placeBlock(document.children, block, { targetId: target.id, side: 'inside' })
        : placeBlock(document.children, block)
    if (!children) {
      setDropError('That element cannot be placed there.')
      return
    }
    commit(children)
    setDropPreview(null)
    setSelected(block.id)
  }
  const move = (sourceId: string, targetId?: string, resolution?: DropResolution) => {
    const source = find(document.children, sourceId)
    if (!source || (targetId && hasDescendant(source, targetId))) {
      setDropError('Invalid move: an element cannot contain itself.')
      return
    }
    const [remaining, detached] = remove(document.children, sourceId)
    if (!detached) return
    const children = resolution
      ? placeBlock(remaining, detached, resolution)
      : targetId
        ? placeBlock(remaining, detached, { targetId, side: 'inside' })
        : [...remaining, detached]
    if (!children) {
      setDropError('That element cannot be placed there.')
      return
    }
    commit(children)
    setDropPreview(null)
    setSelected(detached.id)
  }
  const deleteElement = (id: string) => {
    const [children] = remove(document.children, id)
    commit(children)
    setSelected(null)
  }
  const duplicate = (id: string) => {
    const source = find(document.children, id)
    if (!source) return
    const fresh = (node: Block): Block => ({
      ...clone(node),
      id: crypto.randomUUID(),
      children: node.children.map(fresh),
    })
    const [children] = remove(document.children, id)
    commit([...children, fresh(source)])
  }
  const paste = () => {
    if (!copied) return
    const target = selectedNode?.widget_type === 'container' ? selectedNode.id : undefined
    const fresh = (node: Block): Block => ({
      ...clone(node),
      id: crypto.randomUUID(),
      children: node.children.map(fresh),
    })
    const pasted = fresh(copied)
    commit(target ? insert(document.children, target, pasted) : [...document.children, pasted])
    setSelected(pasted.id)
  }
  const change = (id: string, update: (node: Block) => Block) =>
    commit(document.children.map((node) => updateTree(node, id, update)))
  const addColumns = (node: Block) =>
    change(node.id, (current) => ({
      ...current,
      widget_type: 'container',
      layout: { ...current.layout, direction: 'horizontal' },
      children: [
        {
          id: crypto.randomUUID(),
          kind: 'section',
          widget_type: 'container',
          children: [],
          visible: true,
          optional: false,
          width: '50%',
          layout: { direction: 'vertical', gap: 12, padding: 12 },
        },
        {
          id: crypto.randomUUID(),
          kind: 'section',
          widget_type: 'container',
          children: [],
          visible: true,
          optional: false,
          width: '50%',
          layout: { direction: 'vertical', gap: 12, padding: 12 },
        },
      ],
    }))
  const inspectorNode = selectedNode ? toInspectorNode(selectedNode) : null
  return (
    <div className="flex gap-4 max-w-[1500px] mx-auto h-full">
      <BlockLibraryPanel />
      <main
        className="flex-1 min-h-[700px] space-y-3 overflow-auto bg-slate-100/80 p-6"
        onClick={() => setSelected(null)}
        onDragOver={(event) => {
          event.preventDefault()
          setDropPreview(null)
        }}
        onDrop={(event) => {
          const source = event.dataTransfer.getData('application/x-existing-block')
          if (source) move(source, undefined, dropPreview ?? undefined)
          else {
            const entry = blockLibrary.find(
              (item) => item.label === event.dataTransfer.getData('application/x-block'),
            )
            if (entry) add(entry, undefined, dropPreview ?? undefined)
          }
        }}
      >
        <div
          className="mx-auto w-[794px] min-h-[1123px] bg-white shadow-xl px-[56px] py-[64px] text-slate-900"
          aria-label="A4 quotation page"
          onClick={(event) => event.stopPropagation()}
        >
          {dropError && (
            <p role="alert" className="text-sm text-destructive">
              {dropError}
            </p>
          )}
          {!readOnly && selectedNode && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCopied(clone(selectedNode))
                  setDropError('')
                }}
              >
                Copy
              </Button>
              <Button variant="outline" size="sm" disabled={!copied} onClick={paste}>
                Paste
              </Button>
            </div>
          )}
          {document.children.length === 0 && (
            <div className="p-14 text-center border-2 border-dashed rounded-lg">
              <p className="mb-3">Start building your quotation</p>
              <Button
                disabled={readOnly}
                onClick={() => add({ label: 'Container', widgetType: 'container' })}
              >
                <Plus className="w-4 h-4 mr-2" /> Add container
              </Button>
            </div>
          )}
          {document.children.map((node) => (
            <ElementView
              key={node.id}
              node={node}
              quotation={quotation}
              selected={selected}
              readOnly={readOnly}
              dropPreview={dropPreview}
              onSelect={setSelected}
              onDelete={deleteElement}
              onDuplicate={duplicate}
              onMove={move}
              onChange={change}
              onAdd={add}
              onAddColumns={addColumns}
              onPreview={setDropPreview}
            />
          ))}
        </div>
      </main>
      {!readOnly && (
        <Inspector
          node={inspectorNode}
          onUpdate={(key, value) =>
            selectedNode &&
            change(selectedNode.id, (current) => ({
              ...current,
              settings: { ...current.settings, [key]: value },
            }))
          }
        />
      )}
    </div>
  )
}

function toInspectorNode(node: Block): BuilderNode {
  const widget =
    node.widget_type === 'container' ? 'container' : `field.${node.widget_type ?? 'text'}`
  return {
    id: node.id,
    kind: node.kind,
    widget,
    parentId: null,
    children: node.children.map((child) => child.id),
    props: { ...(node.settings ?? {}) },
    style: {},
    meta: { visible: node.visible, optional: node.optional },
  }
}

function ElementView({
  node,
  quotation,
  selected,
  readOnly,
  dropPreview,
  onSelect,
  onDelete,
  onDuplicate,
  onMove,
  onChange,
  onAdd,
  onAddColumns,
  onPreview,
}: any) {
  const isContainer = node.widget_type === 'container'
  const layout = node.layout ?? {}
  const style: CSSProperties | undefined = isContainer
    ? {
        display: 'flex',
        flexDirection: layout.direction === 'horizontal' ? 'row' : 'column',
        gap: layout.gap ?? 12,
        padding: layout.padding ?? 12,
        width: node.width ?? (layout.width ? `${layout.width}%` : undefined),
        alignItems: layout.align as CSSProperties['alignItems'] | undefined,
        justifyContent: layout.justify as CSSProperties['justifyContent'] | undefined,
      }
    : undefined
  const renderWidget = () => {
    const value = node.settings?.value ?? ''
    const editText = (event: FocusEvent<HTMLElement>) =>
      onChange(node.id, (current: Block) => ({
        ...current,
        settings: { ...current.settings, text: event.currentTarget.textContent ?? '' },
      }))
    switch (node.widget_type) {
      case 'heading':
        return (
          <h2
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onBlur={editText}
            className="text-2xl font-heading font-bold outline-none"
          >
            {node.settings?.text || 'Click to edit heading'}
          </h2>
        )
      case 'text':
      case 'textarea':
        return (
          <p
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onBlur={editText}
            className="whitespace-pre-wrap outline-none"
          >
            {node.settings?.text || 'Click to edit text'}
          </p>
        )
      case 'number':
      case 'currency':
      case 'date':
      case 'select':
      case 'boolean':
        return (
          <FieldInput
            field={{
              id: node.id,
              type: node.settings?.field_type || node.widget_type,
              required: false,
            }}
            value={value}
            readOnly={readOnly}
            onChange={(next: unknown) =>
              onChange(node.id, (current: Block) => ({
                ...current,
                settings: { ...current.settings, value: next },
              }))
            }
          />
        )
      case 'image':
      case 'signature':
      case 'stamp':
        return (
          <div className="space-y-2 text-center">
            {node.settings?.src ? (
              <img
                src={String(node.settings.src)}
                alt={node.widget_type}
                className="max-h-40 max-w-full object-contain mx-auto"
              />
            ) : (
              <div className="border border-dashed p-8 text-sm text-slate-500">
                {readOnly ? '' : `Select ${node.widget_type}`}
              </div>
            )}
            {!readOnly && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  const src = await SelectImage(`Select ${node.widget_type}`)
                  if (src)
                    onChange(node.id, (current: Block) => ({
                      ...current,
                      settings: { ...current.settings, src },
                    }))
                }}
              >
                Choose file
              </Button>
            )}
          </div>
        )
      case 'divider':
        return <hr className="w-full" />
      case 'spacer':
        return <div className="h-8" />
      case 'table':
        return (
          <TableEditor
            tableDef={
              node.settings?.table ?? { id: node.id, name: '', columns: [], has_totals: true }
            }
            rows={node.settings?.rows ?? []}
            readOnly={readOnly}
            onChange={(rows: any[]) =>
              onChange(node.id, (current: Block) => ({
                ...current,
                settings: { ...current.settings, rows },
              }))
            }
          />
        )
      case 'quotation-summary':
        return (
          <div className="ml-auto w-64 text-sm space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatAmount(quotation?.subtotal)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>Grand Total</span>
              <span>{formatAmount(quotation?.grand_total)}</span>
            </div>
          </div>
        )
      default:
        return <span>{node.settings?.text || ''}</span>
    }
  }
  const active = selected === node.id
  const preview = dropPreview?.targetId === node.id
  return (
    <article
      id={`builder-${node.id}`}
      draggable={!readOnly}
      style={style}
      className={`relative min-h-12 ${active ? 'ring-1 ring-primary' : 'border border-transparent'}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(node.id)
      }}
      onDragStart={(event) => event.dataTransfer.setData('application/x-existing-block', node.id)}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!readOnly) onPreview(resolveDrop(event, event.currentTarget, node))
      }}
      onDrop={(event) => {
        event.stopPropagation()
        const resolution =
          dropPreview?.targetId === node.id
            ? dropPreview
            : resolveDrop(event, event.currentTarget, node)
        const source = event.dataTransfer.getData('application/x-existing-block')
        if (source) onMove(source, node.id, resolution)
        else {
          const entry = blockLibrary.find(
            (item) => item.label === event.dataTransfer.getData('application/x-block'),
          )
          if (entry) onAdd(entry, node.id, resolution)
        }
        onPreview(null)
      }}
    >
      {active && (
        <div className="flex items-center gap-1 absolute -top-3 left-2 z-10 bg-white px-1 text-[10px] text-muted-foreground">
          <GripVertical className="w-3 h-3" />
          {node.widget_type || node.kind}
        </div>
      )}
      {preview && (
        <div
          className={`absolute z-10 bg-primary/20 border-primary ${dropPreview.side === 'left' || dropPreview.side === 'right' ? 'top-0 bottom-0 w-1' : 'left-0 right-0 h-1'} ${dropPreview.side === 'right' ? 'right-0' : dropPreview.side === 'left' ? 'left-0' : dropPreview.side === 'before' ? 'top-0' : dropPreview.side === 'after' ? 'bottom-0' : 'inset-2 border-2 border-dashed bg-primary/5'}`}
        />
      )}
      {isContainer && node.children.length === 0 && (
        <span className="text-sm text-muted-foreground">Drop elements here</span>
      )}
      {!isContainer && renderWidget()}
      {node.children.map((child: Block) => (
        <ElementView
          key={child.id}
          node={child}
          quotation={quotation}
          selected={selected}
          readOnly={readOnly}
          dropPreview={dropPreview}
          onSelect={onSelect}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onMove={onMove}
          onChange={onChange}
          onAdd={onAdd}
          onAddColumns={onAddColumns}
          onPreview={onPreview}
        />
      ))}
      {active && !readOnly && (
        <div className="absolute -top-8 right-0 z-20 flex gap-1 bg-white">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Duplicate"
            onClick={() => onDuplicate(node.id)}
          >
            <Copy />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => onDelete(node.id)}>
            <Trash2 />
          </Button>
          {isContainer && (
            <Button size="sm" variant="outline" onClick={() => onAddColumns(node)}>
              <Columns2 className="w-3 h-3 mr-1" />2 Columns
            </Button>
          )}
        </div>
      )}
    </article>
  )
}

function formatAmount(value: unknown) {
  return typeof value === 'number'
    ? (value / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })
    : '-'
}

export function PropertiesPanel({
  node,
  onChange,
}: {
  node: Block | null
  onChange: (id: string, update: (node: Block) => Block) => void
}) {
  if (!node)
    return (
      <aside className="w-56 hidden xl:block border-l p-3 text-sm text-muted-foreground">
        Select an element to edit its properties.
      </aside>
    )
  const settings = node.settings ?? {}
  const textWidget =
    node.widget_type === 'heading' || node.widget_type === 'text' || node.widget_type === 'textarea'
  const valueWidget = ['number', 'currency', 'date', 'select', 'boolean'].includes(
    node.widget_type ?? '',
  )
  return (
    <aside className="w-56 hidden xl:block border-l p-3 space-y-3">
      <h2 className="font-semibold capitalize">
        {node.widget_type?.replaceAll('-', ' ') || 'Element'}
      </h2>
      {node.widget_type === 'container' && (
        <>
          <label className="block text-xs">
            Direction
            <select
              className="w-full border rounded p-1"
              value={node.layout?.direction ?? 'vertical'}
              onChange={(event) =>
                onChange(node.id, (current) => ({
                  ...current,
                  layout: {
                    ...current.layout,
                    direction: event.target.value as 'vertical' | 'horizontal',
                  },
                }))
              }
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </label>
          <label className="block text-xs">
            Gap
            <Input
              type="number"
              value={node.layout?.gap ?? 12}
              onChange={(event) =>
                onChange(node.id, (current) => ({
                  ...current,
                  layout: { ...current.layout, gap: Math.max(0, Number(event.target.value)) },
                }))
              }
            />
          </label>
          {node.layout?.direction === 'horizontal' && node.children.length === 2 && (
            <label className="block text-xs">
              First column {node.children[0].layout?.width ?? 50}%
              <input
                className="w-full"
                type="range"
                min="20"
                max="80"
                value={node.children[0].layout?.width ?? 50}
                onChange={(event) => {
                  const first = Number(event.target.value)
                  onChange(node.id, (current) => ({
                    ...current,
                    children: current.children.map((child, index) => ({
                      ...child,
                      layout: { ...child.layout, width: index === 0 ? first : 100 - first },
                    })),
                  }))
                }}
              />
            </label>
          )}
        </>
      )}
      {textWidget && (
        <label className="block text-xs">
          Content
          <Input
            value={String(settings.text ?? '')}
            onChange={(event) =>
              onChange(node.id, (current) => ({
                ...current,
                settings: { ...current.settings, text: event.target.value },
              }))
            }
          />
        </label>
      )}
      {valueWidget && (
        <label className="block text-xs">
          Value
          <Input
            value={String(settings.value ?? '')}
            onChange={(event) =>
              onChange(node.id, (current) => ({
                ...current,
                settings: { ...current.settings, value: event.target.value },
              }))
            }
          />
        </label>
      )}
      {['image', 'signature', 'stamp'].includes(node.widget_type ?? '') && (
        <p className="text-xs text-muted-foreground">
          Use the file control on the selected media element to replace the asset.
        </p>
      )}
    </aside>
  )
}
