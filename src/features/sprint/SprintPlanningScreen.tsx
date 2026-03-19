import { useEffect, useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSprints, createSprint, getBacklogItems, getDevelopers, patchBacklogItem, getProducts, getSprintBurndown, getVelocity, deleteSprint, getSprintClosePreview, closeSprint, getSprintCapacity, putSprintCapacity, getRetrospective, putRetrospective } from '@/api/client'
import { QUERY_KEYS, STALE_TIMES } from '@/api/queries'
import type { BacklogItem, SprintClosePreview, RetroActionItem } from '@/domain/types'
import { PRIORITY_CONFIG, STATUS_CONFIG } from '@/domain/enums'

export default function SprintPlanningScreen() {
  const queryClient = useQueryClient()
  const { data: sprints = [], isLoading: l1 }   = useQuery({ queryKey: QUERY_KEYS.sprints,      queryFn: getSprints,      staleTime: STALE_TIMES.sprints })
  const { data: items = [], isLoading: l2 }     = useQuery({ queryKey: QUERY_KEYS.backlogItems, queryFn: () => getBacklogItems(), staleTime: STALE_TIMES.backlogItems })
  const { data: developers = [] }               = useQuery({ queryKey: QUERY_KEYS.developers,   queryFn: getDevelopers,   staleTime: STALE_TIMES.developers })
  const { data: products = [] }                 = useQuery({ queryKey: QUERY_KEYS.products,     queryFn: getProducts,     staleTime: STALE_TIMES.products })
  const loading = l1 || l2

  const [selectedSprintId, setSelectedSprintId] = useState<string>('')
  const [showNewSprint, setShowNewSprint] = useState(false)
  const [newSprintName, setNewSprintName] = useState('')
  const [newSprintStart, setNewSprintStart] = useState('')
  const [newSprintEnd, setNewSprintEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [sprintViewMode, setSprintViewMode] = useState<'list' | 'by-dev'>('list')
  const [closePreview, setClosePreview] = useState<SprintClosePreview | null>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (sprints.length > 0 && !selectedSprintId) setSelectedSprintId(sprints[0].id)
  }, [sprints, selectedSprintId])

  const selectedSprint = useMemo(() => sprints.find((s) => s.id === selectedSprintId) ?? null, [sprints, selectedSprintId])

  const sprintItems = useMemo(
    () => items.filter((i) => i.sprintId === selectedSprintId),
    [items, selectedSprintId]
  )

  const backlogItems = useMemo(
    () => items.filter((i) => !i.sprintId && i.status !== 'done' && i.status !== 'cancelled'),
    [items]
  )

  // Capacity calculations
  const capacityByDev = useMemo(() => {
    const map: Record<string, number> = {}
    for (const item of sprintItems) {
      const pts = item.effortStoryPoints ?? 0
      for (const name of item.assigneeIds) {
        map[name] = (map[name] ?? 0) + pts
      }
    }
    return map
  }, [sprintItems])

  async function handleCreateSprint(e: React.FormEvent) {
    e.preventDefault()
    if (!newSprintName.trim()) return
    setSaving(true)
    try {
      const s = await createSprint({
        name: newSprintName.trim(),
        startDate: newSprintStart || undefined,
        endDate: newSprintEnd || undefined,
      })
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sprints })
      setSelectedSprintId(s.id)
      setShowNewSprint(false)
      setNewSprintName('')
      setNewSprintStart('')
      setNewSprintEnd('')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddToSprint(itemId: string) {
    if (!selectedSprintId) return
    await patchBacklogItem(itemId, { sprintId: selectedSprintId })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backlogItems })
  }

  async function handleRemoveFromSprint(itemId: string) {
    await patchBacklogItem(itemId, { sprintId: null })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backlogItems })
  }

  async function handleDeleteSprint() {
    if (!selectedSprintId) return
    if (!confirm('¿Eliminar este sprint? Los items quedarán sin sprint asignado.')) return
    await deleteSprint(selectedSprintId)
    const next = sprints.filter((s) => s.id !== selectedSprintId)
    setSelectedSprintId(next[0]?.id ?? '')
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sprints })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backlogItems })
  }

  async function handleOpenClose() {
    if (!selectedSprintId) return
    const preview = await getSprintClosePreview(selectedSprintId)
    setClosePreview(preview)
  }

  async function handleConfirmClose() {
    if (!selectedSprintId || !closePreview) return
    setClosing(true)
    try {
      await closeSprint(selectedSprintId)
      setClosePreview(null)
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sprints })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backlogItems })
    } finally {
      setClosing(false)
    }
  }

  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])

  // SP used per product in sprint
  const capacityByProduct = useMemo(() => {
    const map: Record<string, number> = {}
    for (const item of sprintItems) {
      const key = item.productId ?? '__none__'
      map[key] = (map[key] ?? 0) + (item.effortStoryPoints ?? 0)
    }
    return map
  }, [sprintItems])

  // Sprint items grouped by assignee
  const itemsByDev = useMemo(() => {
    const map: Record<string, BacklogItem[]> = {}
    for (const item of sprintItems) {
      const keys = item.assigneeIds.length > 0 ? item.assigneeIds : ['__none__']
      for (const name of keys) map[name] = [...(map[name] ?? []), item]
    }
    return map
  }, [sprintItems])

  const { data: burndown } = useQuery({
    queryKey: QUERY_KEYS.sprintBurndown(selectedSprintId),
    queryFn: () => getSprintBurndown(selectedSprintId),
    enabled: !!selectedSprintId,
    staleTime: STALE_TIMES.sprintBurndown,
  })

  const { data: velocity } = useQuery({
    queryKey: QUERY_KEYS.velocity(),
    queryFn: () => getVelocity({ limit: 6 }),
    staleTime: STALE_TIMES.velocity,
  })

  if (loading) return <div className="text-center py-20 text-slate-400">Cargando...</div>

  const totalSP = sprintItems.reduce((sum, i) => sum + (i.effortStoryPoints ?? 0), 0)

  return (
    <div className="flex gap-6 h-full">
      {/* Left: Sprint selector + backlog */}
      <div className="flex flex-col gap-4 w-80 shrink-0">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium text-slate-700">Sprints</h2>
            <button
              onClick={() => setShowNewSprint(!showNewSprint)}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              + Nuevo
            </button>
          </div>

          {showNewSprint && (
            <form onSubmit={handleCreateSprint} className="bg-slate-50 border rounded-lg p-3 mb-2 space-y-2">
              <input
                type="text"
                value={newSprintName}
                onChange={(e) => setNewSprintName(e.target.value)}
                placeholder="Nombre del sprint"
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                autoFocus
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newSprintStart}
                  onChange={(e) => setNewSprintStart(e.target.value)}
                  className="flex-1 border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <input
                  type="date"
                  value={newSprintEnd}
                  onChange={(e) => setNewSprintEnd(e.target.value)}
                  className="flex-1 border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving || !newSprintName.trim()}
                  className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? '...' : 'Crear sprint'}
                </button>
                <button type="button" onClick={() => setShowNewSprint(false)} className="text-xs text-slate-400">
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="space-y-1">
            {sprints.length === 0 ? (
              <p className="text-sm text-slate-400">Sin sprints. Crea el primero.</p>
            ) : (
              sprints.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSprintId(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedSprintId === s.id
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <div className="font-medium">{s.name}</div>
                  {s.startDate && s.endDate && (
                    <div className="text-xs text-slate-400">
                      {new Date(s.startDate).toLocaleDateString('es-AR')} – {new Date(s.endDate).toLocaleDateString('es-AR')}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Backlog sin sprint */}
        <div className="flex-1 min-h-0">
          <h2 className="font-medium text-slate-700 mb-2 flex items-center justify-between">
            <span>Backlog sin sprint</span>
            <span className="text-xs text-slate-400">{backlogItems.length}</span>
          </h2>
          <div className="overflow-y-auto space-y-1.5 max-h-[calc(100vh-380px)]">
            {backlogItems.length === 0 ? (
              <p className="text-xs text-slate-400">Todos los items tienen sprint asignado.</p>
            ) : (
              backlogItems.map((item) => (
                <BacklogRow
                  key={item.id}
                  item={item}
                  productColor={item.productId ? productMap[item.productId]?.color : undefined}
                  action={
                    selectedSprintId ? (
                      <button
                        onClick={() => handleAddToSprint(item.id)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 shrink-0 px-2"
                        title="Agregar al sprint"
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

      {closePreview && (
        <CloseSprintModal
          preview={closePreview}
          closing={closing}
          onConfirm={handleConfirmClose}
          onCancel={() => setClosePreview(null)}
        />
      )}

      {/* Right: Sprint detail */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {!selectedSprint ? (
          <p className="text-slate-400 py-20 text-center">Seleccioná o creá un sprint</p>
        ) : (
          <>
            {/* Sprint header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-semibold">{selectedSprint.name}</h1>
                {selectedSprint.startDate && selectedSprint.endDate && (
                  <p className="text-sm text-slate-500">
                    {new Date(selectedSprint.startDate).toLocaleDateString('es-AR')} – {new Date(selectedSprint.endDate).toLocaleDateString('es-AR')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">{sprintItems.length} items · {totalSP} pts</span>
                {selectedSprint.status !== 'closed' && (
                  <button
                    onClick={handleOpenClose}
                    className="text-xs text-amber-600 hover:text-amber-800 border border-amber-200 rounded px-2 py-1"
                  >
                    Cerrar sprint
                  </button>
                )}
                <button
                  onClick={handleDeleteSprint}
                  className="text-xs text-red-400 hover:text-red-600 border border-red-200 rounded px-2 py-1"
                >
                  Eliminar sprint
                </button>
              </div>
            </div>

            {/* Capacity panels: dev load + product breakdown */}
            {(developers.length > 0 || Object.keys(capacityByProduct).length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {/* Dev capacity */}
                {developers.length > 0 && selectedSprintId && (
                  <DevCapacityPanel
                    sprintId={selectedSprintId}
                    developers={developers}
                    capacityByDev={capacityByDev}
                    queryClient={queryClient}
                  />
                )}

                {/* Product breakdown */}
                {totalSP > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <h3 className="text-xs font-medium text-slate-600 mb-2">Distribución por producto</h3>
                    <div className="space-y-2">
                      {Object.entries(capacityByProduct)
                        .sort(([, a], [, b]) => b - a)
                        .map(([pid, sp]) => {
                          const prod = pid !== '__none__' ? productMap[pid] : null
                          const pct = Math.round((sp / totalSP) * 100)
                          return (
                            <div key={pid}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="flex items-center gap-1.5">
                                  {prod?.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: prod.color }} />}
                                  <span className="text-slate-600 truncate">{prod?.name ?? 'Sin producto'}</span>
                                </span>
                                <span className="text-slate-500 font-medium shrink-0 ml-2">{sp} pts · {pct}%</span>
                              </div>
                              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${pct}%`, backgroundColor: prod?.color ?? '#94a3b8' }}
                                />
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Burndown chart */}
            {burndown && burndown.snapshots.length > 1 && (
              <div className="bg-slate-50 rounded-lg p-3">
                <h3 className="text-xs font-medium text-slate-600 mb-2">
                  Burndown · {burndown.totalCommittedPoints} pts comprometidos
                </h3>
                <BurndownChart
                  data={burndown.snapshots.map(s => ({
                    label: new Date(s.date + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
                    remaining: s.remainingStoryPoints,
                    ideal: s.ideal,
                    isToday: s.isToday,
                  }))}
                  total={burndown.totalCommittedPoints}
                />
              </div>
            )}
            {burndown && burndown.snapshots.length <= 1 && selectedSprint?.startDate && (
              <div className="bg-slate-50 rounded-lg p-3 text-center text-xs text-slate-400">
                Datos insuficientes para burndown — se acumulan con el uso diario
              </div>
            )}

            {/* Velocity panel */}
            {velocity && velocity.sprints.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3">
                <h3 className="text-xs font-medium text-slate-600 mb-2">
                  Velocity — últimos {velocity.sprints.length} sprints completados
                  <span className="ml-2 font-normal text-slate-400">promedio: {velocity.averageVelocity} pts</span>
                </h3>
                <div className="flex items-end gap-1.5 h-12">
                  {[...velocity.sprints].reverse().map((s) => {
                    const maxSP = Math.max(...velocity.sprints.map(x => x.committedStoryPoints), 1)
                    const hPct = s.committedStoryPoints / maxSP
                    const donePct = s.committedStoryPoints > 0 ? s.completedStoryPoints / s.committedStoryPoints : 0
                    return (
                      <div key={s.id} className="flex-1 flex flex-col items-center gap-0.5" title={`${s.name}: ${s.completedStoryPoints}/${s.committedStoryPoints} pts`}>
                        <div className="w-full relative" style={{ height: `${Math.max(4, hPct * 40)}px` }}>
                          <div className="absolute bottom-0 w-full bg-slate-200 rounded-sm" style={{ height: '100%' }} />
                          <div
                            className="absolute bottom-0 w-full bg-indigo-500 rounded-sm"
                            style={{ height: `${donePct * 100}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400 truncate w-full text-center">{s.name.replace(/sprint\s*/i, 'S')}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Retrospective */}
            {selectedSprintId && (
              <RetroPanel sprintId={selectedSprintId} />
            )}

            {/* Sprint items */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-slate-600">Items del sprint</h3>
                <div className="flex text-xs border rounded overflow-hidden">
                  <button
                    onClick={() => setSprintViewMode('list')}
                    className={`px-2 py-1 ${sprintViewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    Lista
                  </button>
                  <button
                    onClick={() => setSprintViewMode('by-dev')}
                    className={`px-2 py-1 ${sprintViewMode === 'by-dev' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    Por developer
                  </button>
                </div>
              </div>

              {sprintItems.length === 0 ? (
                <p className="text-sm text-slate-400">Sin items. Usá las flechas del backlog para agregar.</p>
              ) : sprintViewMode === 'list' ? (
                <div className="space-y-1.5">
                  {sprintItems.map((item) => (
                    <BacklogRow
                      key={item.id}
                      item={item}
                      productColor={item.productId ? productMap[item.productId]?.color : undefined}
                      action={
                        <button onClick={() => handleRemoveFromSprint(item.id)} className="text-xs text-slate-400 hover:text-red-500 shrink-0 px-2" title="Quitar del sprint">×</button>
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {[...Object.entries(itemsByDev)].sort(([a], [b]) => a === '__none__' ? 1 : b === '__none__' ? -1 : a.localeCompare(b)).map(([devName, devItems]) => {
                    const sp = devItems.reduce((s, i) => s + (i.effortStoryPoints ?? 0), 0)
                    const done = devItems.filter((i) => i.status === 'done').length
                    return (
                      <div key={devName}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-slate-700">
                            {devName === '__none__' ? 'Sin asignar' : devName}
                          </span>
                          <span className="text-xs text-slate-400">{done}/{devItems.length} · {sp} pts</span>
                        </div>
                        <div className="space-y-1.5">
                          {devItems.map((item) => (
                            <BacklogRow
                              key={item.id}
                              item={item}
                              productColor={item.productId ? productMap[item.productId]?.color : undefined}
                              action={
                                <button onClick={() => handleRemoveFromSprint(item.id)} className="text-xs text-slate-400 hover:text-red-500 shrink-0 px-2" title="Quitar del sprint">×</button>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BurndownChart({
  data,
  total,
}: {
  data: Array<{ label: string; remaining: number; ideal: number; isToday: boolean }>
  total: number
}) {
  const W = 400, H = 90
  const padL = 24, padR = 8, padT = 6, padB = 20
  const cW = W - padL - padR
  const cH = H - padT - padB
  const n = data.length

  const x = (i: number) => padL + (i / (n - 1)) * cW
  const y = (v: number) => padT + cH - (v / total) * cH

  const idealPath = `M${x(0)},${y(total)} L${x(n - 1)},${y(0)}`
  const actualPath = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.remaining)}`).join(' ')

  // Show x labels at most every ~5 days
  const step = Math.ceil(n / 6)
  const labelIdxs = data.map((_, i) => i).filter((i) => i % step === 0 || i === n - 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 90 }}>
      {/* Today marker */}
      {data.findIndex((p) => p.isToday) >= 0 && (
        <line
          x1={x(data.findIndex((p) => p.isToday))}
          x2={x(data.findIndex((p) => p.isToday))}
          y1={padT} y2={padT + cH}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="2,2"
        />
      )}
      {/* Ideal line */}
      <path d={idealPath} stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4,3" fill="none" />
      {/* Actual line */}
      <path d={actualPath} stroke="#6366f1" strokeWidth="2" fill="none" strokeLinejoin="round" />
      {/* X axis labels */}
      {labelIdxs.map((i) => (
        <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="#94a3b8">
          {data[i].label}
        </text>
      ))}
      {/* Y axis: 0 and total */}
      <text x={padL - 4} y={padT + 4} textAnchor="end" fontSize="8" fill="#94a3b8">{total}</text>
      <text x={padL - 4} y={padT + cH} textAnchor="end" fontSize="8" fill="#94a3b8">0</text>
    </svg>
  )
}

function CloseSprintModal({
  preview,
  closing,
  onConfirm,
  onCancel,
}: {
  preview: SprintClosePreview
  closing: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const toSprint = preview.incompleteItems.filter(i => i.destination.type === 'sprint')
  const toBacklog = preview.incompleteItems.filter(i => i.destination.type === 'backlog')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Cerrar sprint: {preview.sprint.name}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {preview.completedCount} items completados · {preview.incompleteItems.length} incompletos
          </p>
        </div>

        <div className="px-6 py-4 max-h-96 overflow-y-auto space-y-4">
          {preview.incompleteItems.length === 0 ? (
            <p className="text-sm text-slate-500">Todos los items están completados.</p>
          ) : (
            <>
              {toSprint.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Se moverán al siguiente sprint:</p>
                  <div className="space-y-1">
                    {toSprint.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-sm bg-slate-50 rounded px-3 py-1.5">
                        <span className="truncate text-slate-700">{item.title}</span>
                        <span className="text-xs text-indigo-600 shrink-0 ml-2">
                          {item.destination.type === 'sprint' ? item.destination.sprintName : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {toBacklog.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Vuelven al backlog (sin sprint siguiente):</p>
                  <div className="space-y-1">
                    {toBacklog.map(item => (
                      <div key={item.id} className="flex items-center text-sm bg-amber-50 rounded px-3 py-1.5">
                        <span className="truncate text-slate-700">{item.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={closing}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={closing}
            className="text-sm bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 disabled:opacity-50"
          >
            {closing ? 'Cerrando...' : 'Confirmar cierre'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DevCapacityPanel ─────────────────────────────────────────────────────────

function DevCapacityPanel({
  sprintId,
  developers,
  capacityByDev,
  queryClient,
}: {
  sprintId: string
  developers: import('@/domain/types').Developer[]
  capacityByDev: Record<string, number>
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const { data: capacityEntries = [] } = useQuery({
    queryKey: QUERY_KEYS.sprintCapacity(sprintId),
    queryFn: () => getSprintCapacity(sprintId),
    staleTime: STALE_TIMES.sprintCapacity,
  })

  const [editingDevId, setEditingDevId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const capacityMap = useMemo(
    () => Object.fromEntries(capacityEntries.map((e) => [e.developerId, e])),
    [capacityEntries]
  )

  async function handleSaveCapacity(devId: string) {
    const val = parseFloat(editingValue)
    if (isNaN(val)) { setEditingDevId(null); return }
    await putSprintCapacity(sprintId, devId, { capacityStoryPoints: val })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sprintCapacity(sprintId) })
    setEditingDevId(null)
  }

  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <h3 className="text-xs font-medium text-slate-600 mb-2">Carga por developer</h3>
      <div className="space-y-2">
        {developers.map((dev) => {
          const entry = capacityMap[dev.id]
          const cap = entry?.capacityStoryPoints ?? dev.capacityPerSprint
          const used = capacityByDev[dev.name] ?? 0
          const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : null
          const barColor = pct == null ? 'bg-indigo-500' : pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : 'bg-green-500'
          return (
            <div key={dev.id}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-600">{dev.name}</span>
                <span className={`font-medium ${pct !== null && pct > 100 ? 'text-red-600' : 'text-slate-500'}`}>
                  {used} /&nbsp;
                  {editingDevId === dev.id ? (
                    <input
                      type="number"
                      className="w-12 border rounded px-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      value={editingValue}
                      autoFocus
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => handleSaveCapacity(dev.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCapacity(dev.id); if (e.key === 'Escape') setEditingDevId(null) }}
                    />
                  ) : (
                    <button
                      className="underline decoration-dotted hover:text-indigo-600"
                      title="Click para editar capacidad"
                      onClick={() => { setEditingDevId(dev.id); setEditingValue(String(cap)) }}
                    >
                      {cap} pts
                    </button>
                  )}
                </span>
              </div>
              {cap > 0 && (
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── RetroPanel ───────────────────────────────────────────────────────────────

function RetroPanel({ sprintId }: { sprintId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [wentWell, setWentWell] = useState('')
  const [toImprove, setToImprove] = useState('')
  const [actionItems, setActionItems] = useState<RetroActionItem[]>([])
  const [newActionText, setNewActionText] = useState('')
  const [loaded, setLoaded] = useState(false)

  const { data: retro } = useQuery({
    queryKey: QUERY_KEYS.retrospective(sprintId),
    queryFn: () => getRetrospective(sprintId),
    staleTime: STALE_TIMES.retrospective,
    enabled: open,
  })

  // Sync local state when retro loads
  useMemo(() => {
    if (retro !== undefined && !loaded) {
      setWentWell(retro?.wentWell ?? '')
      setToImprove(retro?.toImprove ?? '')
      setActionItems(retro?.actionItems ?? [])
      setLoaded(true)
    }
  }, [retro, loaded])

  // Reset loaded flag when sprint changes
  useMemo(() => { setLoaded(false) }, [sprintId])

  async function handleBlurSave() {
    const saved = await putRetrospective(sprintId, { wentWell: wentWell || null, toImprove: toImprove || null, actionItems })
    queryClient.setQueryData(QUERY_KEYS.retrospective(sprintId), saved)
  }

  async function handleToggleAction(idx: number) {
    const updated = actionItems.map((a, i) => i === idx ? { ...a, done: !a.done } : a)
    setActionItems(updated)
    const saved = await putRetrospective(sprintId, { wentWell: wentWell || null, toImprove: toImprove || null, actionItems: updated })
    queryClient.setQueryData(QUERY_KEYS.retrospective(sprintId), saved)
  }

  async function handleAddAction() {
    if (!newActionText.trim()) return
    const updated = [...actionItems, { text: newActionText.trim(), done: false }]
    setActionItems(updated)
    setNewActionText('')
    const saved = await putRetrospective(sprintId, { wentWell: wentWell || null, toImprove: toImprove || null, actionItems: updated })
    queryClient.setQueryData(QUERY_KEYS.retrospective(sprintId), saved)
  }

  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <button
        className="w-full flex items-center justify-between text-xs font-medium text-slate-600"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Retrospectiva</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">¿Qué salió bien?</label>
            <textarea
              className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
              rows={3}
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              onBlur={handleBlurSave}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">¿Qué mejorar?</label>
            <textarea
              className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
              rows={3}
              value={toImprove}
              onChange={(e) => setToImprove(e.target.value)}
              onBlur={handleBlurSave}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Action items</label>
            <div className="space-y-1 mb-2">
              {actionItems.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={a.done}
                    onChange={() => handleToggleAction(i)}
                    className="rounded"
                  />
                  <span className={a.done ? 'line-through text-slate-400' : 'text-slate-700'}>{a.text}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="Nuevo action item..."
                value={newActionText}
                onChange={(e) => setNewActionText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddAction() }}
              />
              <button
                onClick={handleAddAction}
                className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BacklogRow({
  item,
  productColor,
  action,
}: {
  item: BacklogItem
  productColor?: string
  action?: React.ReactNode
}) {
  const pCfg = PRIORITY_CONFIG[item.priority]
  const sCfg = STATUS_CONFIG[item.status]
  return (
    <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2 text-sm hover:shadow-sm transition-shadow">
      <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${pCfg.bgColor} ${pCfg.color}`}>
        {pCfg.label}
      </span>
      <span className="flex-1 truncate text-slate-700" title={item.title}>{item.title}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${sCfg.bgColor} ${sCfg.color}`}>
        {sCfg.label}
      </span>
      {productColor && (
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: productColor }} />
      )}
      {item.effortStoryPoints != null && (
        <span className="text-xs text-slate-400 shrink-0 w-8 text-right">{item.effortStoryPoints}pts</span>
      )}
      {action}
    </div>
  )
}
