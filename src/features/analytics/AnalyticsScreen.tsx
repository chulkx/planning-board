import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getCycleTime, getThroughput, getWipAging, getTeamLoad,
  getEstimationAccuracy, getProducts, getSprints, getRetrospective,
  getDeveloperStats,
} from '@/api/client'
import { QUERY_KEYS, STALE_TIMES } from '@/api/queries'
import { STATUS_CONFIG, PRIORITY_CONFIG } from '@/domain/enums'

type Tab = 'flow' | 'team' | 'estimation' | 'retro' | 'devs'

export default function AnalyticsScreen() {
  const [tab, setTab] = useState<Tab>('flow')
  const [productId, setProductId] = useState('')

  const { data: products = [] } = useQuery({ queryKey: QUERY_KEYS.products, queryFn: getProducts, staleTime: STALE_TIMES.products })

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'flow',       label: 'Flujo' },
    { id: 'team',       label: 'Equipo' },
    { id: 'estimation', label: 'Estimaciones' },
    { id: 'retro',      label: 'Retrospectivas' },
    { id: 'devs',       label: 'Devs' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analítica</h1>
        <select
          value={productId}
          onChange={e => setProductId(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Todos los productos</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'flow'       && <FlowTab productId={productId || undefined} />}
      {tab === 'team'       && <TeamTab productId={productId || undefined} />}
      {tab === 'estimation' && <EstimationTab productId={productId || undefined} />}
      {tab === 'retro'      && <RetroTab />}
      {tab === 'devs'       && <DevsTab />}
    </div>
  )
}

// ─── Flow Tab ────────────────────────────────────────────────────────────────

function FlowTab({ productId }: { productId?: string }) {
  const { data: ct, isLoading: l1 } = useQuery({
    queryKey: QUERY_KEYS.cycleTime(productId),
    queryFn: () => getCycleTime({ productId }),
    staleTime: STALE_TIMES.cycleTime,
  })
  const { data: wip, isLoading: l2 } = useQuery({
    queryKey: QUERY_KEYS.wipAging,
    queryFn: getWipAging,
    staleTime: STALE_TIMES.wipAging,
  })

  const maxBucketCount = useMemo(() => Math.max(1, ...(ct?.buckets.map(b => b.count) ?? [1])), [ct])

  return (
    <div className="space-y-6">
      {/* Cycle Time */}
      <div className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold text-slate-800 mb-1">Cycle Time</h2>
        <p className="text-xs text-slate-500 mb-4">Tiempo desde inicio hasta completado</p>
        {l1 ? <LoadingRows /> : !ct || ct.items.length === 0 ? (
          <Empty text="No hay ítems completados con historial de eventos" />
        ) : (
          <div className="space-y-4">
            {/* Stats row */}
            <div className="flex gap-6">
              {[
                { label: 'Promedio', value: ct.avg != null ? formatHours(ct.avg) : '—' },
                { label: 'P50 (mediana)', value: ct.p50 != null ? formatHours(ct.p50) : '—' },
                { label: 'P90', value: ct.p90 != null ? formatHours(ct.p90) : '—' },
                { label: 'Total ítems', value: String(ct.items.length) },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <div className="text-2xl font-bold text-indigo-600">{value}</div>
                  <div className="text-xs text-slate-500">{label}</div>
                </div>
              ))}
            </div>
            {/* Histogram */}
            <div>
              <p className="text-xs text-slate-500 mb-2">Distribución</p>
              <div className="flex items-end gap-3 h-28">
                {ct.buckets.map(b => (
                  <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-slate-600 font-medium">{b.count}</span>
                    <div
                      className="w-full bg-indigo-400 rounded-t transition-all"
                      style={{ height: `${Math.max(4, (b.count / maxBucketCount) * 88)}px` }}
                    />
                    <span className="text-xs text-slate-500">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* WIP Aging */}
      <div className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold text-slate-800 mb-1">WIP Aging</h2>
        <p className="text-xs text-slate-500 mb-4">Ítems activos y cuánto tiempo llevan en su estado actual</p>
        {l2 ? <LoadingRows /> : !wip || wip.items.length === 0 ? (
          <Empty text="No hay ítems en progreso actualmente" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Ítem</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Prioridad</th>
                  <th className="text-left px-3 py-2">Asignados</th>
                  <th className="text-right px-3 py-2">Tiempo en estado</th>
                </tr>
              </thead>
              <tbody>
                {wip.items.map(item => {
                  const sCfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG]
                  const pCfg = PRIORITY_CONFIG[item.priority as keyof typeof PRIORITY_CONFIG]
                  const agingColor = item.hoursInStatus < 48 ? 'text-green-600' : item.hoursInStatus < 120 ? 'text-yellow-600' : 'text-red-600'
                  return (
                    <tr key={item.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2.5 max-w-xs">
                        <span className="text-slate-800 font-medium line-clamp-1" title={item.title}>{item.title}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${sCfg?.bgColor} ${sCfg?.color}`}>{sCfg?.label ?? item.status}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium ${pCfg?.color}`}>{pCfg?.label ?? item.priority}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {item.assigneeIds.length > 0 ? item.assigneeIds.join(', ') : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono text-xs font-medium ${agingColor}`}>
                        {formatHours(item.hoursInStatus)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Team Tab ────────────────────────────────────────────────────────────────

function TeamTab({ productId }: { productId?: string }) {
  const { data: sprints = [] } = useQuery({ queryKey: QUERY_KEYS.sprints, queryFn: getSprints, staleTime: STALE_TIMES.sprints })
  const [sprintId, setSprintId] = useState('')

  const { data: throughput, isLoading: l1 } = useQuery({
    queryKey: QUERY_KEYS.throughput(productId),
    queryFn: () => getThroughput({ productId, limit: 10 }),
    staleTime: STALE_TIMES.throughput,
  })
  const { data: teamLoad, isLoading: l2 } = useQuery({
    queryKey: QUERY_KEYS.teamLoad(sprintId || undefined),
    queryFn: () => getTeamLoad(sprintId || undefined),
    staleTime: STALE_TIMES.teamLoad,
  })

  const maxCompleted = useMemo(() => Math.max(1, ...(throughput?.sprints.map(s => s.completedItems) ?? [1])), [throughput])

  return (
    <div className="space-y-6">
      {/* Throughput */}
      <div className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold text-slate-800 mb-1">Throughput</h2>
        <p className="text-xs text-slate-500 mb-4">Ítems completados por sprint</p>
        {l1 ? <LoadingRows /> : !throughput || throughput.sprints.length === 0 ? (
          <Empty text="No hay sprints cerrados aún" />
        ) : (
          <div className="space-y-2">
            {[...throughput.sprints].reverse().map(s => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-28 shrink-0 truncate" title={s.name}>{s.name}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full flex items-center justify-end pr-2 transition-all"
                      style={{ width: `${Math.max(4, (s.completedItems / maxCompleted) * 100)}%` }}
                    >
                      <span className="text-xs text-white font-medium">{s.completedItems}</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 w-16 text-right shrink-0">{s.completedSp > 0 ? `${s.completedSp} SP` : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team Load */}
      <div className="bg-white border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-800">Carga del equipo</h2>
            <p className="text-xs text-slate-500">Horas asignadas vs capacidad</p>
          </div>
          <select
            value={sprintId}
            onChange={e => setSprintId(e.target.value)}
            className="border rounded px-2 py-1 text-xs bg-white focus:outline-none"
          >
            <option value="">Sprint activo</option>
            {sprints.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {l2 ? <LoadingRows /> : !teamLoad || teamLoad.developers.length === 0 ? (
          <Empty text="No hay developers configurados" />
        ) : (
          <div className="space-y-3">
            {teamLoad.developers.map(dev => {
              const pct = dev.loadPct ?? 0
              const barColor = pct < 80 ? 'bg-green-500' : pct <= 100 ? 'bg-yellow-500' : 'bg-red-500'
              return (
                <div key={dev.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{dev.name}</span>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{dev.assignedItems} ítems · {dev.assignedSp} SP</span>
                      <span className={`font-semibold ${pct < 80 ? 'text-green-600' : pct <= 100 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {dev.loadPct != null ? `${dev.loadPct}%` : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Estimation Tab ──────────────────────────────────────────────────────────

function EstimationTab({ productId }: { productId?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.estimationAccuracy(productId),
    queryFn: () => getEstimationAccuracy({ productId, limit: 10 }),
    staleTime: STALE_TIMES.estimationAccuracy,
  })

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-800">Accuracy de estimación</h2>
            <p className="text-xs text-slate-500">Story points comprometidos vs completados por sprint</p>
          </div>
          {data?.avgAccuracy != null && (
            <div className="text-center">
              <div className={`text-2xl font-bold ${data.avgAccuracy >= 80 ? 'text-green-600' : data.avgAccuracy >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                {data.avgAccuracy}%
              </div>
              <div className="text-xs text-slate-500">Promedio</div>
            </div>
          )}
        </div>
        {isLoading ? <LoadingRows /> : !data || data.sprints.length === 0 ? (
          <Empty text="No hay sprints cerrados con métricas de story points" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-3 py-2">Sprint</th>
                <th className="text-right px-3 py-2">Comprometidos</th>
                <th className="text-right px-3 py-2">Completados</th>
                <th className="text-right px-3 py-2">Accuracy</th>
                <th className="text-right px-3 py-2">Sin SP</th>
              </tr>
            </thead>
            <tbody>
              {data.sprints.map(s => (
                <tr key={s.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-800">{s.name}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{s.committedSp ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{s.completedSp ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    {s.accuracyPct != null ? (
                      <span className={`font-semibold ${s.accuracyPct >= 80 ? 'text-green-600' : s.accuracyPct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {s.accuracyPct}%
                      </span>
                    ) : <span className="text-slate-400 text-xs">Sin datos</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs">
                    {s.itemsWithoutSp > 0
                      ? <span className="text-amber-600 font-medium">{s.itemsWithoutSp} sin SP</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Retro Tab ───────────────────────────────────────────────────────────────

function RetroTab() {
  const { data: sprints = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.sprints,
    queryFn: getSprints,
    staleTime: STALE_TIMES.sprints,
  })

  const closedSprints = useMemo(() =>
    sprints.filter(s => s.status === 'closed' || s.status === 'completed')
      .sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? '')),
    [sprints]
  )

  return (
    <div className="space-y-4">
      {isLoading ? <LoadingRows /> : closedSprints.length === 0 ? (
        <Empty text="No hay sprints cerrados aún" />
      ) : (
        closedSprints.map(sprint => <RetroCard key={sprint.id} sprintId={sprint.id} sprintName={sprint.name} />)
      )}
    </div>
  )
}

function RetroCard({ sprintId, sprintName }: { sprintId: string; sprintName: string }) {
  const { data: retro } = useQuery({
    queryKey: QUERY_KEYS.retrospective(sprintId),
    queryFn: () => getRetrospective(sprintId),
    staleTime: STALE_TIMES.retrospective,
  })

  if (!retro) return null

  const doneActions = retro.actionItems.filter(a => a.done).length
  const totalActions = retro.actionItems.length

  return (
    <div className="bg-white border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">{sprintName}</h3>
        {totalActions > 0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            doneActions === totalActions ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {doneActions}/{totalActions} acciones
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        {retro.wentWell && (
          <div>
            <p className="text-xs font-medium text-green-700 mb-1">Qué salió bien</p>
            <p className="text-slate-600 text-xs line-clamp-3">{retro.wentWell}</p>
          </div>
        )}
        {retro.toImprove && (
          <div>
            <p className="text-xs font-medium text-amber-700 mb-1">Qué mejorar</p>
            <p className="text-slate-600 text-xs line-clamp-3">{retro.toImprove}</p>
          </div>
        )}
      </div>
      {retro.actionItems.length > 0 && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs font-medium text-slate-500 mb-2">Action items</p>
          <div className="flex flex-wrap gap-2">
            {retro.actionItems.map((a, i) => (
              <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${a.done ? 'bg-green-100 text-green-700 line-through' : 'bg-slate-100 text-slate-600'}`}>
                {a.text}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function formatHours(hours: number): string {
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const rem  = Math.round(hours % 24)
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`
}

function Empty({ text }: { text: string }) {
  return <p className="text-center text-slate-400 py-8 text-sm">{text}</p>
}

function LoadingRows() {
  return (
    <div className="space-y-2 py-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-6 rounded bg-muted animate-pulse" style={{ width: `${60 + i * 10}%` }} />
      ))}
    </div>
  )
}

// ─── Devs Tab ─────────────────────────────────────────────────────────────────

function DevsTab() {
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.developerStats(),
    queryFn: () => getDeveloperStats(),
    staleTime: STALE_TIMES.developerStats,
  })

  if (isLoading) return <LoadingRows />
  if (!data || data.developers.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Sin datos de desarrolladores</p>
  }

  const maxHeatmap = Math.max(1, ...data.developers.flatMap(d => d.activityHeatmap.map(w => w.closedItems)))

  return (
    <div className="space-y-8">
      {/* Current load table */}
      <section>
        <h2 className="text-base font-semibold mb-3">Carga actual (sprint activo)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500">
                <th className="text-left py-2 font-medium">Developer</th>
                <th className="text-right py-2 font-medium">SP asignados</th>
                <th className="text-right py-2 font-medium">Capacidad SP</th>
                <th className="text-left py-2 font-medium w-40">Carga</th>
                <th className="text-right py-2 font-medium">Ítems</th>
              </tr>
            </thead>
            <tbody>
              {data.developers.map(dev => {
                const pct = dev.currentLoad.capacitySP && dev.currentLoad.capacitySP > 0
                  ? Math.min(100, Math.round((dev.currentLoad.assignedSP / dev.currentLoad.capacitySP) * 100))
                  : null
                const color = pct == null ? 'bg-slate-200' : pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-green-500'
                return (
                  <tr key={dev.id} className="border-b last:border-b-0 hover:bg-slate-50">
                    <td className="py-2 font-medium">{dev.name}</td>
                    <td className="py-2 text-right">{dev.currentLoad.assignedSP}</td>
                    <td className="py-2 text-right text-slate-400">{dev.currentLoad.capacitySP ?? '—'}</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct ?? 0}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 w-8 text-right">{pct != null ? `${pct}%` : '—'}</span>
                      </div>
                    </td>
                    <td className="py-2 text-right text-slate-500">{dev.currentLoad.assignedItems}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Throughput per dev */}
      {data.developers.some(d => d.throughput.some(t => t.completed > 0)) && (
        <section>
          <h2 className="text-base font-semibold mb-3">Throughput por dev (últimos sprints)</h2>
          <div className="space-y-3">
            {data.developers.map(dev => {
              const maxCompleted = Math.max(1, ...dev.throughput.map(t => t.completed))
              return (
                <div key={dev.id}>
                  <p className="text-xs font-medium text-slate-600 mb-1">{dev.name}</p>
                  <div className="flex gap-1 items-end h-12">
                    {dev.throughput.map((t, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-xs text-slate-400">{t.completed}</span>
                        <div
                          className="w-full bg-indigo-400 rounded-t"
                          style={{ height: `${Math.max(4, (t.completed / maxCompleted) * 36)}px` }}
                          title={t.sprintName}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Cycle time */}
      <section>
        <h2 className="text-base font-semibold mb-3">Cycle time promedio por dev</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-slate-500">
              <th className="text-left py-2 font-medium">Developer</th>
              <th className="text-right py-2 font-medium">Promedio (hs)</th>
              <th className="text-right py-2 font-medium">Promedio (días)</th>
            </tr>
          </thead>
          <tbody>
            {data.developers.map(dev => (
              <tr key={dev.id} className="border-b last:border-b-0">
                <td className="py-2">{dev.name}</td>
                <td className="py-2 text-right">{dev.avgCycleTimeHours != null ? dev.avgCycleTimeHours : '—'}</td>
                <td className="py-2 text-right text-slate-400">
                  {dev.avgCycleTimeHours != null ? (dev.avgCycleTimeHours / 24).toFixed(1) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Activity heatmap */}
      <section>
        <h2 className="text-base font-semibold mb-3">Actividad — ítems cerrados por semana</h2>
        <div className="space-y-3">
          {data.developers.map(dev => (
            <div key={dev.id} className="flex items-center gap-3">
              <span className="text-xs text-slate-600 w-24 shrink-0 truncate">{dev.name}</span>
              <div className="flex gap-1">
                {dev.activityHeatmap.map((w, i) => {
                  const intensity = w.closedItems / maxHeatmap
                  const opacity = w.closedItems === 0 ? 0.05 : 0.15 + intensity * 0.85
                  return (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-sm bg-indigo-600 cursor-default"
                      style={{ opacity }}
                      title={`${w.weekStart}: ${w.closedItems} cerrados`}
                    />
                  )
                })}
              </div>
              <span className="text-xs text-slate-400">
                {dev.activityHeatmap.reduce((s, w) => s + w.closedItems, 0)} total
              </span>
            </div>
          ))}
          <p className="text-xs text-slate-400">Últimas 12 semanas</p>
        </div>
      </section>
    </div>
  )
}
