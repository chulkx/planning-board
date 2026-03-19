import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getBacklogItems, getProducts, getDevelopers, getSprints, getMilestones } from '@/api/client'
import { QUERY_KEYS, STALE_TIMES } from '@/api/queries'
import type { BacklogItem } from '@/domain/types'
import { PRIORITY_CONFIG, STATUS_CONFIG, ITEM_TYPE_CONFIG } from '@/domain/enums'
import ItemEditPanel from './ItemEditPanel'

const columnHelper = createColumnHelper<BacklogItem>()

export default function BacklogScreen() {
  const queryClient = useQueryClient()
  const { data: items = [], isLoading: l1 }     = useQuery({ queryKey: QUERY_KEYS.backlogItems, queryFn: getBacklogItems, staleTime: STALE_TIMES.backlogItems })
  const { data: products = [], isLoading: l2 }  = useQuery({ queryKey: QUERY_KEYS.products,     queryFn: getProducts,     staleTime: STALE_TIMES.products })
  const { data: developers = [], isLoading: l3 }= useQuery({ queryKey: QUERY_KEYS.developers,   queryFn: getDevelopers,   staleTime: STALE_TIMES.developers })
  const { data: sprints = [], isLoading: l4 }   = useQuery({ queryKey: QUERY_KEYS.sprints,      queryFn: getSprints,      staleTime: STALE_TIMES.sprints })
  const { data: milestones = [], isLoading: l5 }= useQuery({ queryKey: QUERY_KEYS.milestones,   queryFn: getMilestones,   staleTime: STALE_TIMES.milestones })
  const loading = l1 || l2 || l3 || l4 || l5

  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedItem, setSelectedItem] = useState<BacklogItem | null>(null)

  // Filters
  const [filterProduct, setFilterProduct] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterSprint, setFilterSprint] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  const productMap  = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])
  const sprintMap   = useMemo(() => Object.fromEntries(sprints.map((s) => [s.id, s])), [sprints])
  const milestoneMap= useMemo(() => Object.fromEntries(milestones.map((m) => [m.id, m])), [milestones])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterProduct && item.productId !== filterProduct) return false
      if (filterStatus && item.status !== filterStatus) return false
      if (filterPriority && item.priority !== filterPriority) return false
      if (filterAssignee && !item.assigneeIds.includes(filterAssignee)) return false
      if (filterSprint === '__none__') { if (item.sprintId !== null) return false }
      else if (filterSprint && item.sprintId !== filterSprint) return false
      if (filterSearch) {
        const q = filterSearch.toLowerCase()
        if (!item.title.toLowerCase().includes(q) && !(item.description ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [items, filterProduct, filterStatus, filterPriority, filterAssignee, filterSprint, filterSearch])

  const handleSaved = useCallback((updated: BacklogItem) => {
    queryClient.setQueryData<BacklogItem[]>(QUERY_KEYS.backlogItems, (old = []) =>
      old.map((i) => i.id === updated.id ? updated : i)
    )
  }, [queryClient])

  const columns = useMemo(() => [
    columnHelper.accessor('externalId', {
      header: 'ID',
      cell: (info) => <span className="text-slate-400 text-xs font-mono">{info.getValue() ?? '-'}</span>,
      size: 65,
    }),
    columnHelper.accessor('itemType', {
      header: 'Tipo',
      cell: (info) => {
        const cfg = ITEM_TYPE_CONFIG[info.getValue()]
        return <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
      },
      size: 85,
    }),
    columnHelper.accessor('priority', {
      header: 'Prioridad',
      cell: (info) => {
        const cfg = PRIORITY_CONFIG[info.getValue()]
        return (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bgColor} ${cfg.color}`}>
            {cfg.label}
          </span>
        )
      },
      size: 90,
    }),
    columnHelper.accessor('title', {
      header: 'Título',
      cell: (info) => (
        <button
          className="text-sm font-medium text-slate-800 hover:text-indigo-600 text-left line-clamp-2 w-full"
          title={info.getValue()}
          onClick={() => setSelectedItem(info.row.original)}
        >
          {info.getValue()}
        </button>
      ),
    }),
    columnHelper.accessor('status', {
      header: 'Estado',
      cell: (info) => {
        const cfg = STATUS_CONFIG[info.getValue()]
        return (
          <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bgColor} ${cfg.color}`}>
            {cfg.label}
          </span>
        )
      },
      size: 110,
    }),
    columnHelper.accessor('productId', {
      header: 'Producto',
      cell: (info) => {
        const product = info.getValue() ? productMap[info.getValue()!] : null
        if (!product) return <span className="text-slate-300 text-xs">—</span>
        return (
          <span className="text-xs font-medium flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: product.color }} />
            {product.name}
          </span>
        )
      },
      size: 120,
    }),
    columnHelper.accessor('assigneeIds', {
      header: 'Asignados',
      cell: (info) => {
        const names = info.getValue()
        if (!names.length) return <span className="text-slate-300 text-xs">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {names.map((name) => (
              <span key={name} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                {name.split(' ')[0]}
              </span>
            ))}
          </div>
        )
      },
      size: 130,
    }),
    columnHelper.accessor('sprintId', {
      header: 'Sprint',
      cell: (info) => {
        const sprint = info.getValue() ? sprintMap[info.getValue()!] : null
        if (!sprint) return <span className="text-slate-300 text-xs">—</span>
        return (
          <span className="text-xs text-slate-600 bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">
            {sprint.name}
          </span>
        )
      },
      size: 110,
    }),
    columnHelper.accessor('milestoneId', {
      header: 'Milestone',
      cell: (info) => {
        const milestone = info.getValue() ? milestoneMap[info.getValue()!] : null
        if (!milestone) return <span className="text-slate-300 text-xs">—</span>
        return (
          <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
            {milestone.name}
          </span>
        )
      },
      size: 110,
    }),
    columnHelper.accessor('dueDate', {
      header: 'Vencimiento',
      cell: (info) => {
        const d = info.getValue()
        if (!d) return <span className="text-slate-300 text-xs">—</span>
        const date = new Date(d)
        const isOverdue = date < new Date() && info.row.original.status !== 'done'
        return (
          <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
            {date.toLocaleDateString('es-AR')}
          </span>
        )
      },
      size: 100,
    }),
  ], [productMap, sprintMap, milestoneMap])

  const table = useReactTable({
    data: filteredItems,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const hasFilters = !!(filterProduct || filterStatus || filterPriority || filterAssignee || filterSprint || filterSearch)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Backlog Global</h1>
        <span className="text-sm text-slate-500">{filteredItems.length} items</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Buscar..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <select
          value={filterProduct}
          onChange={(e) => setFilterProduct(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Todos los productos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Todas las prioridades</option>
          {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Todos los asignados</option>
          {developers.map((d) => (
            <option key={d.id} value={d.name}>{d.name}</option>
          ))}
        </select>
        <select
          value={filterSprint}
          onChange={(e) => setFilterSprint(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Todos los sprints</option>
          <option value="__none__">Sin sprint</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setFilterProduct('')
              setFilterStatus('')
              setFilterPriority('')
              setFilterAssignee('')
              setFilterSprint('')
              setFilterSearch('')
            }}
            className="text-sm text-slate-400 hover:text-slate-600 px-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-3"><div className="h-3 w-12 rounded bg-muted animate-pulse" /></td>
                  <td className="px-3 py-3"><div className="h-3 w-48 rounded bg-muted animate-pulse" /></td>
                  <td className="px-3 py-3"><div className="h-3 w-20 rounded bg-muted animate-pulse" /></td>
                  <td className="px-3 py-3"><div className="h-3 w-16 rounded bg-muted animate-pulse" /></td>
                  <td className="px-3 py-3"><div className="h-3 w-24 rounded bg-muted animate-pulse" /></td>
                  <td className="px-3 py-3"><div className="h-3 w-16 rounded bg-muted animate-pulse" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg mb-2">No hay items en el backlog</p>
          <Link to="/import" className="text-indigo-600 text-sm hover:underline">Importar CSV →</Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-left px-3 py-2.5 font-medium whitespace-nowrap select-none"
                      style={{ width: header.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className={header.column.getCanSort() ? 'cursor-pointer hover:text-slate-800' : ''}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-t hover:bg-slate-50 transition-colors ${selectedItem?.id === row.original.id ? 'bg-indigo-50' : ''}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredItems.length === 0 && (
            <p className="text-center text-slate-400 py-8 text-sm">Sin resultados para los filtros aplicados</p>
          )}
        </div>
      )}

      <ItemEditPanel
        item={selectedItem}
        products={products}
        developers={developers}
        sprints={sprints}
        milestones={milestones}
        onClose={() => setSelectedItem(null)}
        onSaved={handleSaved}
      />
    </div>
  )
}
