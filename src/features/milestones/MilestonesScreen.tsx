import { useEffect, useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMilestones, createMilestone, getBacklogItems, patchBacklogItem, getProducts } from '@/api/client'
import { QUERY_KEYS, STALE_TIMES } from '@/api/queries'
import { request } from '@/api/internal'
import type { BacklogItem } from '@/domain/types'
import { STATUS_CONFIG } from '@/domain/enums'

export default function MilestonesScreen() {
  const queryClient = useQueryClient()
  const { data: milestones = [], isLoading: l1 }= useQuery({ queryKey: QUERY_KEYS.milestones,   queryFn: getMilestones,   staleTime: STALE_TIMES.milestones })
  const { data: items = [], isLoading: l2 }     = useQuery({ queryKey: QUERY_KEYS.backlogItems, queryFn: () => getBacklogItems(), staleTime: STALE_TIMES.backlogItems })
  const { data: products = [] }                 = useQuery({ queryKey: QUERY_KEYS.products,     queryFn: getProducts,     staleTime: STALE_TIMES.products })
  const loading = l1 || l2

  const [selectedId, setSelectedId] = useState<string>('')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (milestones.length > 0 && !selectedId) setSelectedId(milestones[0].id)
  }, [milestones, selectedId])

  const selected = useMemo(() => milestones.find((m) => m.id === selectedId) ?? null, [milestones, selectedId])

  const milestoneItems = useMemo(
    () => items.filter((i) => i.milestoneId === selectedId),
    [items, selectedId]
  )

  const unassigned = useMemo(
    () => items.filter((i) => !i.milestoneId && i.status !== 'done' && i.status !== 'cancelled'),
    [items]
  )

  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])

  // Progress stats
  const stats = useMemo(() => {
    const total = milestoneItems.length
    const done = milestoneItems.filter((i) => i.status === 'done').length
    const inProgress = milestoneItems.filter((i) => i.status === 'in-progress' || i.status === 'review').length
    return { total, done, inProgress, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
  }, [milestoneItems])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      const m = await createMilestone({ name: newName.trim(), targetDate: newDate || undefined })
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.milestones })
      setSelectedId(m.id)
      setShowNew(false)
      setNewName('')
      setNewDate('')
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd(itemId: string) {
    if (!selectedId) return
    await patchBacklogItem(itemId, { milestoneId: selectedId })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backlogItems })
  }

  async function handleRemove(itemId: string) {
    await patchBacklogItem(itemId, { milestoneId: null })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backlogItems })
  }

  async function handleDelete() {
    if (!selectedId) return
    if (!confirm('¿Eliminar este milestone? Los items quedarán sin milestone asignado.')) return
    await request(`/milestones/${selectedId}`, { method: 'DELETE' })
    const next = milestones.filter((m) => m.id !== selectedId)
    setSelectedId(next[0]?.id ?? '')
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.milestones })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backlogItems })
  }

  if (loading) return <div className="text-center py-20 text-slate-400">Cargando...</div>

  return (
    <div className="flex gap-6 h-full">
      {/* Left: Milestone list + unassigned items */}
      <div className="flex flex-col gap-4 w-80 shrink-0">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium text-slate-700">Milestones</h2>
            <button onClick={() => setShowNew(!showNew)} className="text-xs text-indigo-600 hover:text-indigo-800">
              + Nuevo
            </button>
          </div>

          {showNew && (
            <form onSubmit={handleCreate} className="bg-slate-50 border rounded-lg p-3 mb-2 space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del milestone"
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                autoFocus
              />
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving || !newName.trim()}
                  className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? '...' : 'Crear milestone'}
                </button>
                <button type="button" onClick={() => setShowNew(false)} className="text-xs text-slate-400">
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="space-y-1">
            {milestones.length === 0 ? (
              <p className="text-sm text-slate-400">Sin milestones.</p>
            ) : (
              milestones.map((m) => {
                const mItems = items.filter((i) => i.milestoneId === m.id)
                const mDone = mItems.filter((i) => i.status === 'done').length
                const pct = mItems.length > 0 ? Math.round((mDone / mItems.length) * 100) : 0
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedId === m.id
                        ? 'bg-amber-50 text-amber-800 font-medium'
                        : 'hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium truncate">{m.name}</span>
                      <span className="text-xs text-slate-400 shrink-0 ml-2">{pct}%</span>
                    </div>
                    {m.targetDate && (
                      <div className="text-xs text-slate-400">
                        Meta: {new Date(m.targetDate).toLocaleDateString('es-AR')}
                      </div>
                    )}
                    {mItems.length > 0 && (
                      <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Unassigned backlog */}
        <div className="flex-1 min-h-0">
          <h2 className="font-medium text-slate-700 mb-2 flex items-center justify-between">
            <span>Sin milestone</span>
            <span className="text-xs text-slate-400">{unassigned.length}</span>
          </h2>
          <div className="overflow-y-auto space-y-1.5 max-h-[calc(100vh-400px)]">
            {unassigned.length === 0 ? (
              <p className="text-xs text-slate-400">Todos los items tienen milestone.</p>
            ) : (
              unassigned.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  productColor={item.productId ? productMap[item.productId]?.color : undefined}
                  action={
                    selectedId ? (
                      <button
                        onClick={() => handleAdd(item.id)}
                        className="text-xs text-amber-600 hover:text-amber-800 shrink-0 px-2"
                        title="Agregar al milestone"
                      >
                        →
                      </button>
                    ) : null
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right: Milestone detail */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {!selected ? (
          <p className="text-slate-400 py-20 text-center">Seleccioná o creá un milestone</p>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-semibold">{selected.name}</h1>
                {selected.targetDate && (
                  <p className="text-sm text-slate-500">
                    Fecha meta: {new Date(selected.targetDate).toLocaleDateString('es-AR')}
                  </p>
                )}
              </div>
              <button
                onClick={handleDelete}
                className="text-xs text-red-400 hover:text-red-600 border border-red-200 rounded px-2 py-1"
              >
                Eliminar milestone
              </button>
            </div>

            {/* Progress */}
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-amber-800">Progreso</span>
                <span className="text-lg font-bold text-amber-700">{stats.pct}%</span>
              </div>
              <div className="h-3 bg-amber-200 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${stats.pct}%` }}
                />
              </div>
              <div className="flex gap-6 text-xs text-amber-700">
                <span><strong>{stats.total}</strong> total</span>
                <span><strong>{stats.done}</strong> completados</span>
                <span><strong>{stats.inProgress}</strong> en progreso</span>
                <span><strong>{stats.total - stats.done - stats.inProgress}</strong> pendientes</span>
              </div>
            </div>

            {/* Items breakdown by status */}
            <div className="flex-1 overflow-y-auto">
              {(['done', 'review', 'in-progress', 'not-started', 'cancelled'] as const).map((status) => {
                const statusItems = milestoneItems.filter((i) => i.status === status)
                if (statusItems.length === 0) return null
                const cfg = STATUS_CONFIG[status]
                return (
                  <div key={status} className="mb-4">
                    <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full ${cfg.bgColor} ${cfg.color}`}>{cfg.label}</span>
                      <span>{statusItems.length}</span>
                    </h3>
                    <div className="space-y-1.5">
                      {statusItems.map((item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          productColor={item.productId ? productMap[item.productId]?.color : undefined}
                          action={
                            <button
                              onClick={() => handleRemove(item.id)}
                              className="text-xs text-slate-400 hover:text-red-500 shrink-0 px-2"
                              title="Quitar del milestone"
                            >
                              ×
                            </button>
                          }
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
              {milestoneItems.length === 0 && (
                <p className="text-sm text-slate-400">Sin items. Usá las flechas del panel izquierdo para agregar.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ItemRow({
  item,
  productColor,
  action,
}: {
  item: BacklogItem
  productColor?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2 text-sm hover:shadow-sm transition-shadow">
      {productColor && (
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: productColor }} />
      )}
      <span className="flex-1 truncate text-slate-700" title={item.title}>{item.title}</span>
      {action}
    </div>
  )
}
