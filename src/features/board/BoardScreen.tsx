import { useEffect, useState, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getBacklogItems, getProducts, getDevelopers, getSprints, getMilestones, patchBacklogItem } from '@/api/client'
import { QUERY_KEYS, STALE_TIMES } from '@/api/queries'
import type { BacklogItem, BoardColumn } from '@/domain/types'
import { PRIORITY_CONFIG, STATUS_CONFIG, type BacklogStatus } from '@/domain/enums'
import ItemEditPanel from '@/features/backlog/ItemEditPanel'

export default function BoardScreen() {
  const queryClient = useQueryClient()
  const { data: items = [], isLoading: l1 }     = useQuery({ queryKey: QUERY_KEYS.backlogItems, queryFn: () => getBacklogItems(), staleTime: STALE_TIMES.backlogItems })
  const { data: products = [], isLoading: l2 }  = useQuery({ queryKey: QUERY_KEYS.products,     queryFn: getProducts,     staleTime: STALE_TIMES.products })
  const { data: developers = [] }               = useQuery({ queryKey: QUERY_KEYS.developers,   queryFn: getDevelopers,   staleTime: STALE_TIMES.developers })
  const { data: sprints = [] }                  = useQuery({ queryKey: QUERY_KEYS.sprints,      queryFn: getSprints,      staleTime: STALE_TIMES.sprints })
  const { data: milestones = [] }               = useQuery({ queryKey: QUERY_KEYS.milestones,   queryFn: getMilestones,   staleTime: STALE_TIMES.milestones })
  const loading = l1 || l2

  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [activeItem, setActiveItem] = useState<BacklogItem | null>(null)
  const [editItem, setEditItem] = useState<BacklogItem | null>(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterSprint, setFilterSprint] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  useEffect(() => {
    if (products.length > 0 && !selectedProductId) setSelectedProductId(products[0].id)
  }, [products, selectedProductId])

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId]
  )

  const columns: BoardColumn[] = useMemo(
    () => selectedProduct?.boardColumns ?? [
      { name: 'not-started', wipLimit: null },
      { name: 'in-progress', wipLimit: null },
      { name: 'review', wipLimit: null },
      { name: 'done', wipLimit: null },
    ],
    [selectedProduct]
  )

  const boardItems = useMemo(
    () => selectedProductId === '__all__' ? items : items.filter((i) => !selectedProductId || i.productId === selectedProductId),
    [items, selectedProductId]
  )

  const filteredBoardItems = useMemo(() => boardItems.filter((i) => {
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      if (!i.title.toLowerCase().includes(q)) return false
    }
    if (filterPriority && i.priority !== filterPriority) return false
    if (filterAssignee && !i.assigneeIds.includes(filterAssignee)) return false
    if (filterSprint === '__none__') { if (i.sprintId !== null) return false }
    else if (filterSprint && i.sprintId !== filterSprint) return false
    return true
  }), [boardItems, filterSearch, filterPriority, filterAssignee, filterSprint])

  const hasFilters = !!(filterSearch || filterPriority || filterAssignee || filterSprint)

  const byColumn = useMemo(() => {
    const map: Record<string, BacklogItem[]> = {}
    for (const col of columns) map[col.name] = []
    for (const item of filteredBoardItems) {
      if (map[item.status]) map[item.status].push(item)
      else {
        const first = columns[0]
        if (first) map[first.name].push(item)
      }
    }
    return map
  }, [filteredBoardItems, columns])

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
    if (columns.some(c => c.name === over.id)) {
      targetStatus = over.id as BacklogStatus
    } else {
      const overItem = items.find((i) => i.id === over.id)
      if (overItem) targetStatus = overItem.status
    }

    if (!targetStatus || targetStatus === draggedItem.status) return

    // Optimistic update in cache
    const snapshot = queryClient.getQueryData<BacklogItem[]>(QUERY_KEYS.backlogItems) ?? []
    queryClient.setQueryData<BacklogItem[]>(QUERY_KEYS.backlogItems,
      (old = []) => old.map((i) => i.id === draggedItem.id ? { ...i, status: targetStatus! } : i)
    )
    try {
      const updated = await patchBacklogItem(draggedItem.id, { status: targetStatus })
      queryClient.setQueryData<BacklogItem[]>(QUERY_KEYS.backlogItems,
        (old = []) => old.map((i) => i.id === updated.id ? updated : i)
      )
    } catch {
      queryClient.setQueryData(QUERY_KEYS.backlogItems, snapshot)
    }
  }

  function handleSaved(updated: BacklogItem) {
    queryClient.setQueryData<BacklogItem[]>(QUERY_KEYS.backlogItems,
      (old = []) => old.map((i) => i.id === updated.id ? updated : i)
    )
  }

  if (loading) return (
    <div className="flex gap-4 h-full">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex-1 min-w-[220px] flex flex-col gap-2">
          <div className="h-5 w-24 rounded bg-muted animate-pulse mb-1" />
          {Array.from({ length: 4 }).map((_, j) => (
            <div key={j} className="rounded-lg border bg-white p-3 flex flex-col gap-2">
              <div className="h-3 w-full rounded bg-muted animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-muted animate-pulse mt-1" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )

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
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold mr-2">Board</h1>
        <select
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 font-medium"
        >
          <option value="__all__">Todos los productos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="w-px h-5 bg-border mx-1" />
        <input
          type="text"
          placeholder="Buscar..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Prioridad</option>
          {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Asignado</option>
          {developers.map((d) => (
            <option key={d.id} value={d.name}>{d.name}</option>
          ))}
        </select>
        <select
          value={filterSprint}
          onChange={(e) => setFilterSprint(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Sprint</option>
          <option value="__none__">Sin sprint</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterSearch(''); setFilterPriority(''); setFilterAssignee(''); setFilterSprint('') }}
            className="text-sm text-slate-400 hover:text-slate-600 px-2"
          >
            Limpiar
          </button>
        )}
        <span className="text-sm text-slate-500 ml-auto">
          {filteredBoardItems.length}{hasFilters ? `/${boardItems.length}` : ''} items
        </span>
      </div>

      {/* Kanban columns */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1 items-start">
          {columns.map((col) => {
            const colItems = byColumn[col.name] ?? []
            const cfg = STATUS_CONFIG[col.name as BacklogStatus]
            return (
              <KanbanColumn
                key={col.name}
                id={col.name}
                label={cfg.label}
                items={colItems}
                wipLimit={col.wipLimit}
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
  wipLimit: number | null
  onEditItem: (item: BacklogItem) => void
  activeId: string | null
}

function KanbanColumn({ id, label, items, wipLimit, onEditItem, activeId }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const wipExceeded = wipLimit != null && items.length > wipLimit

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
        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
          wipExceeded
            ? 'bg-red-100 text-red-600'
            : 'bg-white text-slate-400'
        }`}>
          {wipLimit != null ? `${items.length}/${wipLimit}` : items.length}
        </span>
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
