import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { patchBacklogItem, getItemEvents } from '@/api/client'
import { QUERY_KEYS, STALE_TIMES } from '@/api/queries'
import type { BacklogItem, Product, Developer, Sprint, Milestone } from '@/domain/types'
import { PRIORITY_CONFIG, STATUS_CONFIG } from '@/domain/enums'

interface Props {
  item: BacklogItem | null
  products: Product[]
  developers: Developer[]
  sprints: Sprint[]
  milestones: Milestone[]
  onClose: () => void
  onSaved: (item: BacklogItem) => void
}

export default function ItemEditPanel({ item, products, developers, sprints, milestones, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Partial<BacklogItem>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'details' | 'activity'>('details')

  useEffect(() => {
    if (item) {
      setDraft({
        status: item.status,
        priority: item.priority,
        productId: item.productId,
        sprintId: item.sprintId,
        milestoneId: item.milestoneId,
        assigneeIds: item.assigneeIds,
        notes: item.notes,
        dueDate: item.dueDate,
        effortStoryPoints: item.effortStoryPoints,
        effortEstimatedHours: item.effortEstimatedHours,
        effortActualHours: item.effortActualHours,
      })
      setError(null)
      setTab('details')
    }
  }, [item])

  if (!item) return null

  async function handleSave() {
    if (!item) return
    setSaving(true)
    setError(null)
    try {
      const updated = await patchBacklogItem(item.id, draft)
      onSaved(updated)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function set(field: keyof BacklogItem, value: any) {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  const currentSprint = sprints.find((s) => s.id === (draft.sprintId ?? item.sprintId))
  const currentMilestone = milestones.find((m) => m.id === (draft.milestoneId ?? item.milestoneId))

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[440px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {item.externalId && (
                <span className="text-xs text-slate-400 font-mono">#{item.externalId}</span>
              )}
              <span className="text-xs text-slate-400">{item.itemType}</span>
            </div>
            <h2 className="font-semibold text-slate-800 leading-snug line-clamp-3">{item.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none mt-0.5 shrink-0"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-5">
          <button
            onClick={() => setTab('details')}
            className={`text-sm py-2 px-3 border-b-2 -mb-px font-medium transition-colors ${tab === 'details' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Detalles
          </button>
          <button
            onClick={() => setTab('activity')}
            className={`text-sm py-2 px-3 border-b-2 -mb-px font-medium transition-colors ${tab === 'activity' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Actividad
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">{error}</div>
          )}

          {tab === 'activity' ? (
            <ItemActivityTab itemId={item.id} />
          ) : (
            <>
              {/* Status + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Estado">
                  <select
                    value={draft.status ?? item.status}
                    onChange={(e) => set('status', e.target.value as BacklogItem['status'])}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Prioridad">
                  <select
                    value={draft.priority ?? item.priority}
                    onChange={(e) => set('priority', e.target.value as BacklogItem['priority'])}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Product */}
              <Field label="Producto">
                <select
                  value={draft.productId ?? item.productId ?? ''}
                  onChange={(e) => set('productId', e.target.value || null)}
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="">Sin producto</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>

              {/* Assignees */}
              <Field label="Asignados">
                <div className="space-y-1.5">
                  {developers.map((dev) => {
                    const ids = draft.assigneeIds ?? item.assigneeIds
                    const checked = ids.includes(dev.name)
                    return (
                      <label key={dev.id} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const current = draft.assigneeIds ?? item.assigneeIds
                            set('assigneeIds', e.target.checked
                              ? [...current, dev.name]
                              : current.filter((n) => n !== dev.name)
                            )
                          }}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <span className="text-sm text-slate-700 group-hover:text-slate-900">{dev.name}</span>
                      </label>
                    )
                  })}
                  {developers.length === 0 && (
                    <p className="text-xs text-slate-400">No hay desarrolladores registrados</p>
                  )}
                </div>
              </Field>

              {/* Sprint */}
              <Field label="Sprint">
                <select
                  value={draft.sprintId ?? item.sprintId ?? ''}
                  onChange={(e) => set('sprintId', e.target.value || null)}
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="">Sin sprint</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {currentSprint && (
                  <p className="text-xs text-slate-400 mt-1">
                    {currentSprint.startDate && currentSprint.endDate
                      ? `${new Date(currentSprint.startDate).toLocaleDateString('es-AR')} – ${new Date(currentSprint.endDate).toLocaleDateString('es-AR')}`
                      : currentSprint.status}
                  </p>
                )}
              </Field>

              {/* Milestone */}
              <Field label="Milestone">
                <select
                  value={draft.milestoneId ?? item.milestoneId ?? ''}
                  onChange={(e) => set('milestoneId', e.target.value || null)}
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="">Sin milestone</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {currentMilestone?.targetDate && (
                  <p className="text-xs text-slate-400 mt-1">
                    Meta: {new Date(currentMilestone.targetDate).toLocaleDateString('es-AR')}
                  </p>
                )}
              </Field>

              {/* Dates */}
              <Field label="Fecha vencimiento">
                <input
                  type="date"
                  value={(draft.dueDate ?? item.dueDate ?? '').slice(0, 10)}
                  onChange={(e) => set('dueDate', e.target.value || null)}
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </Field>

              {/* Effort */}
              <div className="grid grid-cols-3 gap-2">
                <Field label="Story pts">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={draft.effortStoryPoints ?? item.effortStoryPoints ?? ''}
                    onChange={(e) => set('effortStoryPoints', e.target.value ? Number(e.target.value) : null)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    placeholder="—"
                  />
                </Field>
                <Field label="Hs estimadas">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={draft.effortEstimatedHours ?? item.effortEstimatedHours ?? ''}
                    onChange={(e) => set('effortEstimatedHours', e.target.value ? Number(e.target.value) : null)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    placeholder="—"
                  />
                </Field>
                <Field label="Hs reales">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={draft.effortActualHours ?? item.effortActualHours ?? ''}
                    onChange={(e) => set('effortActualHours', e.target.value ? Number(e.target.value) : null)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    placeholder="—"
                  />
                </Field>
              </div>

              {/* Notes */}
              <MarkdownField
                label="Notas"
                value={draft.notes ?? item.notes ?? ''}
                onChange={(v) => set('notes', v || null)}
                placeholder="Notas internas... (soporta **Markdown**)"
              />

              {/* Description (read-only) */}
              {item.description && (
                <Field label="Descripción (del CSV)">
                  <p className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 rounded p-2 max-h-40 overflow-y-auto">
                    {item.description}
                  </p>
                </Field>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex gap-3 bg-slate-50">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-slate-100 text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function ItemActivityTab({ itemId }: { itemId: string }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.itemEvents(itemId),
    queryFn: () => getItemEvents(itemId),
    staleTime: STALE_TIMES.itemEvents,
  })

  const EVENT_ICONS: Record<string, string> = {
    status_changed: '🔄',
    priority_changed: '⚡',
    sprint_changed: '📅',
    assigned: '👤',
    imported: '📥',
    automation: '🤖',
  }

  const SOURCE_LABELS: Record<string, string> = {
    user: 'manual',
    import: 'import',
    automation: 'auto',
    system: 'sistema',
  }

  if (isLoading) return <p className="text-xs text-slate-400 py-4 text-center">Cargando...</p>
  if (events.length === 0) return <p className="text-xs text-slate-400 py-4 text-center">Sin actividad registrada</p>

  return (
    <div className="space-y-1">
      {events.map((ev) => (
        <div key={ev.id} className="flex gap-2 py-2 border-b last:border-b-0">
          <span className="text-base shrink-0">{EVENT_ICONS[ev.eventType] ?? '•'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-slate-700">{ev.eventType.replace(/_/g, ' ')}</span>
              {ev.field && <span className="text-xs text-slate-400">{ev.field}</span>}
              <span className={`text-xs px-1 rounded ${ev.source === 'automation' ? 'bg-purple-50 text-purple-600' : ev.source === 'import' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                {SOURCE_LABELS[ev.source] ?? ev.source}
              </span>
            </div>
            {(ev.oldValue || ev.newValue) && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {ev.oldValue && <span className="line-through text-red-400">{ev.oldValue}</span>}
                {ev.oldValue && ev.newValue && <span> → </span>}
                {ev.newValue && <span className="text-green-600">{ev.newValue}</span>}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-0.5">
              {new Date(ev.createdAt).toLocaleString('es-AR')}
              {ev.actor && ` · ${ev.actor}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function MarkdownField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [preview, setPreview] = useState(false)
  const html = simpleMarkdown(value)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</label>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="text-xs text-slate-400 hover:text-indigo-600"
        >
          {preview ? 'Editar' : 'Vista previa'}
        </button>
      </div>
      {preview ? (
        <div
          className="min-h-[80px] text-sm text-slate-700 bg-slate-50 rounded p-2 prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: html || '<span class="text-slate-400">Sin contenido</span>' }}
        />
      ) : (
        <textarea
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none font-mono"
          placeholder={placeholder}
        />
      )}
    </div>
  )
}

function simpleMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 rounded text-xs">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-sm mt-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold text-base mt-2">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-1">')
    .replace(/\n/g, '<br>')
}
