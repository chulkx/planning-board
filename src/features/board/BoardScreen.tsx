import { useEffect, useState, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getBacklogItems, getProducts, getDevelopers, getSprints, getMilestones, patchBacklogItem } from '@/api/client'
import type { BacklogItem, Product, Developer, Sprint, Milestone } from '@/domain/types'
import { PRIORITY_CONFIG, STATUS_CONFIG, type BacklogStatus } from '@/domain/enums'
import ItemEditPanel from '@/features/backlog/ItemEditPanel'

export default function BoardScreen() {
  const [items, setItems] = useState<BacklogItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [developers, setDevelopers] = useState<Developer[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [activeItem, setActiveItem] = useState<BacklogItem | null>(null)
  const [editItem, setEditItem] = useState<BacklogItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  useEffect(() => {
    Promise.all([
      getBacklogItems(),
      getProducts(),
      getDevelopers(),
      getSprints(),
      getMilestones(),
    ]).then(([its, prods, devs, sprts, miles]) => {
      setItems(its)
      setProducts(prods)
      setDevelopers(devs)
      setSprints(sprts)
      setMilestones(miles)
      if (prods.length > 0) setSelectedProductId(prods[0].id)
    }).finally(() => setLoading(false))
  }, [])

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId]
  )

  const columns: BacklogStatus[] = useMemo(
    () => (selectedProduct?.boardColumns as BacklogStatus[]) ?? ['not-started', 'in-progress', 'review', 'done'],
    [selectedProduct]
  )

  const boardItems = useMemo(
    () => items.filter((i) => !selectedProductId || i.productId === selectedProductId),
    [items, selectedProductId]
  )

  const byColumn = useMemo(() => {
    const map: Record<string, BacklogItem[]> = {}
    for (const col of columns) map[col] = []
    for (const item of boardItems) {
      if (map[item.status]) map[item.status].push(item)
      else {
        const first = columns[0]
        if (first) map[first].push(item)
      }
    }
    return map
  }, [boardItems, columns])

  function handleDragStart({ active }: DragStartEvent) {
    const item = items.find((i) => i.id === active.id)
    setActiveItem(item ?? null)
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveItem(null)
    if (!over) return

    const draggedItem = items.find((i) => i.id === active.id)
    if (!draggedItem) return

    // Determine target column: over.id is either a column id or an item id
    let targetStatus: BacklogStatus | null = null
    if (columns.includes(over.id as BacklogStatus)) {
      targetStatus = over.id as BacklogStatus
    } else {
      const overItem = items.find((i) => i.id === over.id)
      if (overItem) targetStatus = overItem.status
    }

    if (!targetStatus || targetStatus === draggedItem.status) return

    // Optimistic update
    setItems((prev) => prev.map((i) => i.id === draggedItem.id ? { ...i, status: targetStatus! } : i))
    try {
      const updated = await patchBacklogItem(draggedItem.id, { status: targetStatus })
      setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i))
    } catch {
      // Rollback
      setItems((prev) => prev.map((i) => i.id === draggedItem.id ? draggedItem : i))
    }
  }

  function handleSaved(updated: BacklogItem) {
    setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i))
  }

  if (loading) return <div className="text-center py-20 text-slate-400">Cargando...</div>

  if (products.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p className="text-lg mb-2">No hay productos cargados</p>
        <p className="text-sm">Importá un CSV para crear productos automáticamente.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Board</h1>
        <select
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {selectedProduct && (
          <span className="text-sm text-slate-500">
            {boardItems.length} items
          </span>
        )}
      </div>

      {/* Kanban columns */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1 items-start">
          {columns.map((col) => {
            const colItems = byColumn[col] ?? []
            const cfg = STATUS_CONFIG[col]
            return (
              <KanbanColumn
                key={col}
                id={col}
                label={cfg.label}
                items={colItems}
                onEditItem={setEditItem}
                activeId={activeItem?.id ?? null}
              />
            )
          })}
        </div>

        <DragOverlay>
          {activeItem && <KanbanCard item={activeItem} isDragging />}
        </DragOverlay>
      </DndContext>

      <ItemEditPanel
        item={editItem}
        products={products}
        developers={developers}
        sprints={sprints}
        milestones={milestones}
        onClose={() => setEditItem(null)}
        onSaved={handleSaved}
      />
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

interface ColumnProps {
  id: string
  label: string
  items: BacklogItem[]
  onEditItem: (item: BacklogItem) => void
  activeId: string | null
}

function KanbanColumn({ id, label, items, onEditItem, activeId }: ColumnProps) {
  const { setNodeRef, isOver } = useSortable({
    id,
    data: { type: 'column' },
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 flex flex-col rounded-lg transition-colors ${
        isOver ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-100'
      }`}
    >
      {/* Column header */}
      <div className="px-3 py-2.5 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <span className="text-xs text-slate-400 bg-white rounded-full px-2 py-0.5">{items.length}</span>
      </div>

      {/* Cards */}
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="px-2 pb-2 flex flex-col gap-2 min-h-16">
          {items.map((item) => (
            <KanbanCard
              key={item.id}
              item={item}
              onEdit={() => onEditItem(item)}
              isActive={activeId === item.id}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  item: BacklogItem
  onEdit?: () => void
  isDragging?: boolean
  isActive?: boolean
}

function KanbanCard({ item, onEdit, isDragging, isActive }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } = useSortable({
    id: item.id,
    data: { type: 'item', item },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const priorityCfg = PRIORITY_CONFIG[item.priority]

  if (isSortDragging && !isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="h-20 rounded-lg border-2 border-dashed border-indigo-200 bg-indigo-50"
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg border shadow-sm transition-shadow select-none
        ${isDragging ? 'shadow-xl rotate-1 opacity-95' : ''}
        ${isActive ? 'opacity-50' : ''}
      `}
    >
      {/* Drag handle area + content */}
      <div
        {...attributes}
        {...listeners}
        className="p-3 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${priorityCfg.bgColor} ${priorityCfg.color}`}>
            {priorityCfg.label}
          </span>
          {item.externalId && (
            <span className="text-xs text-slate-300 font-mono shrink-0">#{item.externalId}</span>
          )}
        </div>

        <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-3 mb-2">
          {item.title}
        </p>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {item.assigneeIds.slice(0, 3).map((name) => (
              <span
                key={name}
                className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded"
                title={name}
              >
                {name.split(' ')[0]}
              </span>
            ))}
            {item.assigneeIds.length > 3 && (
              <span className="text-xs text-slate-400">+{item.assigneeIds.length - 3}</span>
            )}
          </div>
          {item.effortStoryPoints != null && (
            <span className="text-xs text-slate-400 shrink-0">{item.effortStoryPoints} pts</span>
          )}
        </div>
      </div>

      {/* Edit button — separate from drag area */}
      <div className="border-t px-3 py-1.5">
        <button
          onClick={onEdit}
          className="text-xs text-slate-400 hover:text-indigo-600 w-full text-left"
        >
          Editar →
        </button>
      </div>
    </div>
  )
}
