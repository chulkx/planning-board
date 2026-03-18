import { useEffect, useState, useMemo } from 'react'
import { getSprints, createSprint, getBacklogItems, getDevelopers, patchBacklogItem, getProducts } from '@/api/client'
import { request } from '@/api/internal'
import type { Sprint, BacklogItem, Developer, Product } from '@/domain/types'
import { PRIORITY_CONFIG, STATUS_CONFIG } from '@/domain/enums'

export default function SprintPlanningScreen() {
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [items, setItems] = useState<BacklogItem[]>([])
  const [developers, setDevelopers] = useState<Developer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSprintId, setSelectedSprintId] = useState<string>('')
  const [showNewSprint, setShowNewSprint] = useState(false)
  const [newSprintName, setNewSprintName] = useState('')
  const [newSprintStart, setNewSprintStart] = useState('')
  const [newSprintEnd, setNewSprintEnd] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getSprints(), getBacklogItems(), getDevelopers(), getProducts()])
      .then(([sprts, its, devs, prods]) => {
        setSprints(sprts)
        setItems(its)
        setDevelopers(devs)
        setProducts(prods)
        if (sprts.length > 0) setSelectedSprintId(sprts[0].id)
      })
      .finally(() => setLoading(false))
  }, [])

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
      setSprints((prev) => [s, ...prev])
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
    const updated = await patchBacklogItem(itemId, { sprintId: selectedSprintId })
    setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i))
  }

  async function handleRemoveFromSprint(itemId: string) {
    const updated = await patchBacklogItem(itemId, { sprintId: null })
    setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i))
  }

  async function handleDeleteSprint() {
    if (!selectedSprintId) return
    if (!confirm('¿Eliminar este sprint? Los items quedarán sin sprint asignado.')) return
    await request(`/sprints/${selectedSprintId}`, { method: 'DELETE' })
    const updated = sprints.filter((s) => s.id !== selectedSprintId)
    setSprints(updated)
    setItems((prev) => prev.map((i) => i.sprintId === selectedSprintId ? { ...i, sprintId: null } : i))
    setSelectedSprintId(updated[0]?.id ?? '')
  }

  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])

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
                <button
                  onClick={handleDeleteSprint}
                  className="text-xs text-red-400 hover:text-red-600 border border-red-200 rounded px-2 py-1"
                >
                  Eliminar sprint
                </button>
              </div>
            </div>

            {/* Capacity bars */}
            {developers.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-600 mb-3">Carga por developer (story points)</h3>
                <div className="space-y-2">
                  {developers
                    .filter((d) => (capacityByDev[d.name] ?? 0) > 0 || d.capacityPerSprint > 0)
                    .map((dev) => {
                      const used = capacityByDev[dev.name] ?? 0
                      const cap = dev.capacityPerSprint
                      const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : null
                      return (
                        <div key={dev.id}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-600">{dev.name}</span>
                            <span className={`font-medium ${pct !== null && pct > 100 ? 'text-red-600' : 'text-slate-500'}`}>
                              {used}{cap > 0 ? ` / ${cap} pts` : ' pts'}
                            </span>
                          </div>
                          {cap > 0 && (
                            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${pct! > 100 ? 'bg-red-500' : pct! > 80 ? 'bg-amber-400' : 'bg-indigo-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Sprint items */}
            <div className="flex-1 overflow-y-auto">
              <h3 className="text-sm font-medium text-slate-600 mb-2">Items del sprint</h3>
              {sprintItems.length === 0 ? (
                <p className="text-sm text-slate-400">Sin items. Usá las flechas del backlog para agregar.</p>
              ) : (
                <div className="space-y-1.5">
                  {sprintItems.map((item) => (
                    <BacklogRow
                      key={item.id}
                      item={item}
                      productColor={item.productId ? productMap[item.productId]?.color : undefined}
                      action={
                        <button
                          onClick={() => handleRemoveFromSprint(item.id)}
                          className="text-xs text-slate-400 hover:text-red-500 shrink-0 px-2"
                          title="Quitar del sprint"
                        >
                          ×
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
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
