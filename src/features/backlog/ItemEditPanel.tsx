import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  patchBacklogItem, getItemEvents,
  getItemLabels, getLabels, addItemLabel, removeItemLabel,
  getItemLinks, createItemLink, deleteItemLink,
  getItemComments, createItemComment, patchItemComment, deleteItemComment,
  getBacklogItems,
} from '@/api/client'
import { QUERY_KEYS, STALE_TIMES } from '@/api/queries'
import type { BacklogItem, Product, Developer, Sprint, Milestone, Label } from '@/domain/types'
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
  const [tab, setTab] = useState<'details' | 'links' | 'comments' | 'activity'>('details')

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
          {(['details', 'links', 'comments', 'activity'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm py-2 px-3 border-b-2 -mb-px font-medium transition-colors ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {t === 'details' ? 'Detalles' : t === 'links' ? 'Relaciones' : t === 'comments' ? 'Comentarios' : 'Actividad'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">{error}</div>
          )}

          {tab === 'activity' ? (
            <ItemActivityTab itemId={item.id} />
          ) : tab === 'links' ? (
            <ItemLinksTab itemId={item.id} />
          ) : tab === 'comments' ? (
            <ItemCommentsTab itemId={item.id} />
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

              {/* Labels */}
              <ItemLabelsField itemId={item.id} />

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

// ─── Labels field ─────────────────────────────────────────────────────────────

function ItemLabelsField({ itemId }: { itemId: string }) {
  const qc = useQueryClient()
  const { data: allLabels = [] } = useQuery({ queryKey: QUERY_KEYS.labels, queryFn: getLabels, staleTime: STALE_TIMES.labels })
  const { data: assigned = [] } = useQuery({ queryKey: QUERY_KEYS.itemLabels(itemId), queryFn: () => getItemLabels(itemId), staleTime: STALE_TIMES.itemLabels })
  const [open, setOpen] = useState(false)

  const assignedIds = new Set(assigned.map((l: Label) => l.id))

  async function toggle(label: Label) {
    if (assignedIds.has(label.id)) {
      await removeItemLabel(itemId, label.id)
    } else {
      await addItemLabel(itemId, label.id)
    }
    qc.invalidateQueries({ queryKey: QUERY_KEYS.itemLabels(itemId) })
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Labels</label>
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {assigned.map((l: Label) => (
          <span key={l.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: l.color }}>
            {l.name}
            <button onClick={() => toggle(l)} className="opacity-70 hover:opacity-100 leading-none">×</button>
          </span>
        ))}
        <button onClick={() => setOpen(o => !o)} className="text-xs text-indigo-600 hover:underline">+ label</button>
      </div>
      {open && allLabels.length > 0 && (
        <div className="border rounded bg-white shadow-sm p-2 space-y-1 max-h-40 overflow-y-auto">
          {allLabels.filter((l: Label) => !assignedIds.has(l.id)).map((l: Label) => (
            <button
              key={l.id}
              onClick={() => { toggle(l); setOpen(false) }}
              className="flex items-center gap-2 w-full text-left text-sm px-2 py-1 hover:bg-slate-50 rounded"
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
              {l.name}
            </button>
          ))}
          {allLabels.filter((l: Label) => !assignedIds.has(l.id)).length === 0 && (
            <p className="text-xs text-slate-400 px-2">Todos los labels ya están asignados</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Links tab ────────────────────────────────────────────────────────────────

function ItemLinksTab({ itemId }: { itemId: string }) {
  const qc = useQueryClient()
  const { data: links, isLoading } = useQuery({ queryKey: QUERY_KEYS.itemLinks(itemId), queryFn: () => getItemLinks(itemId), staleTime: STALE_TIMES.itemLinks })
  const { data: allItems = [] } = useQuery({ queryKey: QUERY_KEYS.backlogItems, queryFn: () => getBacklogItems(), staleTime: STALE_TIMES.backlogItems })
  const [search, setSearch] = useState('')
  const [linkType, setLinkType] = useState<'blocks' | 'related'>('blocks')
  const [adding, setAdding] = useState(false)

  if (isLoading) return <p className="text-xs text-slate-400 py-4 text-center">Cargando...</p>

  const searchResults = search.trim().length >= 2
    ? allItems.filter(i => i.id !== itemId && i.title.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : []

  async function addLink(targetId: string) {
    await createItemLink(itemId, { targetId, linkType })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.itemLinks(itemId) })
    setSearch(''); setAdding(false)
  }

  async function removeLink(linkId: string) {
    await deleteItemLink(itemId, linkId)
    qc.invalidateQueries({ queryKey: QUERY_KEYS.itemLinks(itemId) })
  }

  const LinkRow = ({ link, label }: { link: { id: string; relatedItemId: string; relatedItemTitle: string; relatedItemStatus: string }; label: string }) => (
    <div className="flex items-center gap-2 py-1.5 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm text-slate-700 truncate">{link.relatedItemTitle}</p>
        <span className="text-xs text-slate-400">{link.relatedItemStatus}</span>
      </div>
      <button onClick={() => removeLink(link.id)} className="text-slate-300 hover:text-red-500 text-lg leading-none shrink-0">×</button>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Blocks */}
      {(links?.blocks?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Bloquea a</p>
          {links!.blocks.map(l => <LinkRow key={l.id} link={l} label="bloquea a" />)}
        </div>
      )}
      {/* Blocked by */}
      {(links?.blockedBy?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium text-orange-500 uppercase tracking-wide mb-1">Bloqueado por</p>
          {links!.blockedBy.map(l => <LinkRow key={l.id} link={l} label="bloqueado por" />)}
        </div>
      )}
      {/* Related */}
      {(links?.related?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Relacionado con</p>
          {links!.related.map(l => <LinkRow key={l.id} link={l} label="relacionado" />)}
        </div>
      )}
      {!links?.blocks.length && !links?.blockedBy.length && !links?.related.length && (
        <p className="text-xs text-slate-400 py-2 text-center">Sin relaciones</p>
      )}

      {/* Add link */}
      {!adding ? (
        <button onClick={() => setAdding(true)} className="text-xs text-indigo-600 hover:underline">+ Agregar relación</button>
      ) : (
        <div className="border rounded p-3 space-y-2 bg-slate-50">
          <select value={linkType} onChange={e => setLinkType(e.target.value as 'blocks' | 'related')} className="w-full border rounded px-2 py-1 text-sm">
            <option value="blocks">Bloquea a</option>
            <option value="related">Relacionado con</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ítem por título..."
            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            autoFocus
          />
          {searchResults.map(i => (
            <button key={i.id} onClick={() => addLink(i.id)} className="flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 hover:bg-white border rounded">
              <span className="text-xs text-slate-400 shrink-0">{i.status}</span>
              <span className="truncate">{i.title}</span>
            </button>
          ))}
          <button onClick={() => { setAdding(false); setSearch('') }} className="text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
        </div>
      )}
    </div>
  )
}

// ─── Comments tab ─────────────────────────────────────────────────────────────

function ItemCommentsTab({ itemId }: { itemId: string }) {
  const qc = useQueryClient()
  const { data: comments = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.itemComments(itemId), queryFn: () => getItemComments(itemId), staleTime: STALE_TIMES.itemComments })
  const { data: allDevs = [] } = useQuery({ queryKey: QUERY_KEYS.developers, queryFn: () => import('@/api/client').then(m => m.getDevelopers()), staleTime: STALE_TIMES.developers })
  const [body, setBody] = useState('')
  const [author, setAuthor] = useState(() => localStorage.getItem('last_comment_author') ?? '')
  const [editId, setEditId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)

  if (isLoading) return <p className="text-xs text-slate-400 py-4 text-center">Cargando...</p>

  async function submit() {
    if (!body.trim() || !author.trim()) return
    setSaving(true)
    try {
      await createItemComment(itemId, { author: author.trim(), body: body.trim() })
      localStorage.setItem('last_comment_author', author.trim())
      qc.invalidateQueries({ queryKey: QUERY_KEYS.itemComments(itemId) })
      setBody('')
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(commentId: string) {
    if (!editBody.trim()) return
    await patchItemComment(itemId, commentId, { body: editBody.trim() })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.itemComments(itemId) })
    setEditId(null)
  }

  async function remove(commentId: string) {
    await deleteItemComment(itemId, commentId)
    qc.invalidateQueries({ queryKey: QUERY_KEYS.itemComments(itemId) })
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 && <p className="text-xs text-slate-400 py-2 text-center">Sin comentarios</p>}
      {comments.map(c => (
        <div key={c.id} className="border rounded p-3 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                {c.author[0]?.toUpperCase()}
              </span>
              <span className="text-xs font-medium text-slate-700">{c.author}</span>
              <span className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleString('es-AR')}</span>
            </div>
            {c.author === author && (
              <div className="flex gap-2">
                <button onClick={() => { setEditId(c.id); setEditBody(c.body) }} className="text-xs text-slate-400 hover:text-indigo-600">Editar</button>
                <button onClick={() => remove(c.id)} className="text-xs text-slate-400 hover:text-red-500">Eliminar</button>
              </div>
            )}
          </div>
          {editId === c.id ? (
            <div className="space-y-1">
              <textarea rows={3} value={editBody} onChange={e => setEditBody(e.target.value)} className="w-full border rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              <div className="flex gap-2">
                <button onClick={() => saveEdit(c.id)} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded">Guardar</button>
                <button onClick={() => setEditId(null)} className="text-xs text-slate-400">Cancelar</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.body}</p>
          )}
        </div>
      ))}

      {/* New comment */}
      <div className="space-y-2 border-t pt-3">
        <select value={author} onChange={e => setAuthor(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
          <option value="">Seleccionar autor...</option>
          {allDevs.map((d: { id: string; name: string }) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <textarea
          rows={3}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Escribir comentario..."
          className="w-full border rounded px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <button
          onClick={submit}
          disabled={!body.trim() || !author.trim() || saving}
          className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? 'Enviando...' : 'Comentar'}
        </button>
      </div>
    </div>
  )
}
