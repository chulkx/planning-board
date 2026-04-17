import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getMilestoneStats, getBacklogItems } from '@/api/client'
import { QUERY_KEYS, STALE_TIMES } from '@/api/queries'
import { STATUS_CONFIG } from '@/domain/enums'

export default function MilestoneDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: stats, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.milestoneStats(id!),
    queryFn: () => getMilestoneStats(id!),
    staleTime: STALE_TIMES.milestoneStats,
    enabled: !!id,
  })

  const { data: items = [] } = useQuery({
    queryKey: [...QUERY_KEYS.backlogItems, { milestoneId: id }],
    queryFn: () => getBacklogItems({ milestoneId: id }),
    staleTime: STALE_TIMES.backlogItems,
    enabled: !!id,
  })

  if (isLoading) return <div className="py-20 text-center text-slate-400">Cargando...</div>
  if (isError || !stats) return <div className="py-20 text-center text-red-400">No se encontró el milestone.</div>

  const statusGroups = Object.entries(STATUS_CONFIG)
  const maxBurndown = Math.max(1, ...stats.burndown.map(d => d.open))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/milestones')} className="text-sm text-slate-400 hover:text-slate-700">← Milestones</button>
        <h1 className="text-2xl font-semibold flex-1">{stats.name}</h1>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          stats.status === 'done' ? 'bg-green-100 text-green-700' :
          stats.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
          'bg-slate-100 text-slate-600'
        }`}>{stats.status}</span>
        {stats.targetDate && (
          <span className="text-sm text-slate-500">Meta: {new Date(stats.targetDate).toLocaleDateString('es-AR')}</span>
        )}
      </div>

      {/* Progress card */}
      <div className="border rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-3xl font-bold text-indigo-600">{stats.completionPct}%</span>
          <div className="text-right text-sm text-slate-500">
            <p>{stats.closedItems} cerrados / {stats.totalItems} totales</p>
            {stats.cancelledItems > 0 && <p>{stats.cancelledItems} cancelados</p>}
          </div>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div
            className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${stats.completionPct}%` }}
          />
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-slate-600">Abiertos: <strong>{stats.openItems}</strong></span>
          <span className="text-green-600">Cerrados: <strong>{stats.closedItems}</strong></span>
          {stats.overdueItems > 0 && (
            <span className="text-red-600 font-medium">⚠ {stats.overdueItems} vencidos</span>
          )}
        </div>
      </div>

      {/* Burndown */}
      {stats.burndown.length > 1 && (
        <div className="border rounded-lg p-5">
          <h2 className="text-base font-semibold mb-3">Burndown del milestone</h2>
          <div className="relative h-32">
            <svg className="w-full h-full" viewBox={`0 0 ${stats.burndown.length * 12} 100`} preserveAspectRatio="none">
              {/* Ideal line */}
              <line
                x1="0" y1="0"
                x2={stats.burndown.length * 12} y2="100"
                stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 2"
              />
              {/* Actual line */}
              <polyline
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                points={stats.burndown.map((d, i) => `${i * 12 + 6},${100 - (d.open / maxBurndown) * 95}`).join(' ')}
              />
              {/* Dots */}
              {stats.burndown.map((d, i) => (
                <circle key={i} cx={i * 12 + 6} cy={100 - (d.open / maxBurndown) * 95} r="2.5" fill="#6366f1" />
              ))}
            </svg>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>{stats.burndown[0]?.date?.slice(5)}</span>
              <span>{stats.burndown[stats.burndown.length - 1]?.date?.slice(5)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Items by status */}
      <div className="border rounded-lg p-5">
        <h2 className="text-base font-semibold mb-3">Ítems por estado</h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">No hay ítems asignados a este milestone.</p>
        ) : (
          <div className="space-y-4">
            {statusGroups.map(([status, cfg]) => {
              const statusItems = items.filter(i => i.status === status)
              if (statusItems.length === 0) return null
              return (
                <div key={status}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bgColor} ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-xs text-slate-400">{statusItems.length}</span>
                  </div>
                  <div className="space-y-1">
                    {statusItems.map(item => (
                      <div key={item.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded text-sm">
                        <span className="flex-1 truncate text-slate-700">{item.title}</span>
                        {item.assigneeIds.length > 0 && (
                          <span className="text-xs text-slate-400 shrink-0">{item.assigneeIds.join(', ')}</span>
                        )}
                        {item.dueDate && (
                          <span className={`text-xs shrink-0 ${new Date(item.dueDate) < new Date() && item.status !== 'done' ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                            {new Date(item.dueDate).toLocaleDateString('es-AR')}
                          </span>
                        )}
                      </div>
                    ))}
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
