import { useEffect, useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getProducts, createProduct, patchProduct, deleteProduct,
  getDevelopers, createDeveloper, patchDeveloper, deleteDeveloper,
  getImportHistory, getConfig, patchConfig,
} from '@/api/client'
import { QUERY_KEYS, STALE_TIMES } from '@/api/queries'
import type { AppConfig } from '@/domain/types'
import { EFFORT_UNIT_LABELS, type EffortUnit } from '@/domain/enums'

const COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#3b82f6',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#84cc16',
]

export default function SettingsScreen() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <AppConfigSection />
      <BackupSection />
      <ProductsSection />
      <DevelopersSection />
      <ImportHistorySection />
    </div>
  )
}

// ─── App Config ───────────────────────────────────────────────────────────────

function AppConfigSection() {
  const queryClient = useQueryClient()
  const { data: config } = useQuery({ queryKey: QUERY_KEYS.config, queryFn: getConfig, staleTime: STALE_TIMES.config })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleChange(unit: EffortUnit) {
    if (!config) return
    setSaving(true)
    setSaved(false)
    try {
      await patchConfig({ defaultEffortUnit: unit })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.config })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      toast.success('Configuración guardada')
    } catch {
      toast.error('Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2 className="text-lg font-medium mb-3">General</h2>
      <div className="border rounded-lg bg-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Unidad de esfuerzo por defecto</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Usada en sprints y métricas de capacidad. Los items pueden tener múltiples valores cargados.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-green-600">Guardado</span>}
          <select
            value={config?.defaultEffortUnit ?? 'story-points'}
            onChange={(e) => handleChange(e.target.value as EffortUnit)}
            disabled={saving || !config}
            className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          >
            {(Object.entries(EFFORT_UNIT_LABELS) as [EffortUnit, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>
    </section>
  )
}

// ─── Backup / Restore ────────────────────────────────────────────────────────

function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm(`¿Restaurar desde "${file.name}"? Esto reemplazará TODOS los datos actuales.`)) {
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setRestoring(true)
    setRestoreMsg(null)
    try {
      const text = await file.text()
      const res = await fetch('/api/imports/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? res.statusText)
      }
      const data = await res.json()
      const msg = `Restaurado: ${data.products} productos, ${data.backlogItems} items, ${data.developers} developers.`
      setRestoreMsg({ ok: true, text: msg })
      toast.success(msg)
    } catch (err) {
      setRestoreMsg({ ok: false, text: String(err) })
      toast.error(`Error al restaurar: ${String(err)}`)
    } finally {
      setRestoring(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section>
      <h2 className="text-lg font-medium mb-3">Backup y restauración</h2>
      <div className="border rounded-lg bg-white divide-y">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Exportar JSON completo</p>
            <p className="text-xs text-slate-500 mt-0.5">Descarga todos los datos: productos, items, developers, sprints, milestones.</p>
          </div>
          <button
            onClick={() => { window.location.href = '/api/exports/json' }}
            className="text-sm bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 shrink-0"
          >
            Descargar backup
          </button>
        </div>
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Restaurar desde backup</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Carga un archivo JSON exportado previamente. <span className="text-red-500">Reemplaza todos los datos actuales.</span>
            </p>
            {restoreMsg && (
              <p className={`text-xs mt-1 ${restoreMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                {restoreMsg.text}
              </p>
            )}
          </div>
          <label className={`text-sm border px-4 py-2 rounded cursor-pointer shrink-0 ${restoring ? 'opacity-50 pointer-events-none' : 'hover:bg-slate-50'}`}>
            {restoring ? 'Restaurando...' : 'Cargar backup JSON'}
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
          </label>
        </div>
      </div>
    </section>
  )
}

// ─── Import History ───────────────────────────────────────────────────────────

function ImportHistorySection() {
  const { data: history = [], isLoading: loading } = useQuery({ queryKey: QUERY_KEYS.importHistory, queryFn: getImportHistory, staleTime: STALE_TIMES.importHistory })

  return (
    <section>
      <h2 className="text-lg font-medium mb-3">Historial de importaciones</h2>
      <div className="border rounded-lg bg-white overflow-hidden">
        {loading ? (
          <p className="text-slate-400 text-sm px-4 py-3">Cargando...</p>
        ) : history.length === 0 ? (
          <p className="text-slate-400 text-sm px-4 py-3">Sin importaciones registradas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Archivo</th>
                <th className="text-left px-4 py-2.5 font-medium">Fecha</th>
                <th className="text-right px-4 py-2.5 font-medium">Filas</th>
                <th className="text-right px-4 py-2.5 font-medium text-green-600">Creados</th>
                <th className="text-right px-4 py-2.5 font-medium text-blue-600">Actualizados</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-400">Sin cambios</th>
                <th className="text-right px-4 py-2.5 font-medium text-red-500">Errores</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600 max-w-xs truncate">{h.filename}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                    {new Date(h.importedAt).toLocaleString('es-AR')}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{h.totalRows}</td>
                  <td className="px-4 py-2.5 text-right text-green-600 font-medium">{h.createdCount}</td>
                  <td className="px-4 py-2.5 text-right text-blue-600 font-medium">{h.updatedCount}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{h.skippedCount}</td>
                  <td className="px-4 py-2.5 text-right">
                    {h.errors.length > 0 ? (
                      <span className="text-red-500 font-medium">{h.errors.length}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

// ─── Products ────────────────────────────────────────────────────────────────

function ProductsSection() {
  const queryClient = useQueryClient()
  const { data: products = [], isLoading: loading } = useQuery({ queryKey: QUERY_KEYS.products, queryFn: getProducts, staleTime: STALE_TIMES.products })
  const [editId, setEditId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  async function handleCreate(name: string, color: string) {
    await createProduct({ name, color })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products })
    setShowNew(false)
  }

  async function handleUpdate(id: string, name: string, color: string) {
    await patchProduct(id, { name, color })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products })
    setEditId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este producto? Los items quedarán sin producto asignado.')) return
    await deleteProduct(id)
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products })
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium">Productos</h2>
        <button
          onClick={() => setShowNew(true)}
          className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700"
        >
          + Nuevo producto
        </button>
      </div>

      <div className="border rounded-lg divide-y bg-white">
        {loading ? (
          <p className="text-slate-400 text-sm px-4 py-3">Cargando...</p>
        ) : products.length === 0 && !showNew ? (
          <p className="text-slate-400 text-sm px-4 py-3">Sin productos. Importar un CSV crea productos automáticamente.</p>
        ) : null}

        {products.map((p) => (
          <div key={p.id} className="px-4 py-3">
            {editId === p.id ? (
              <ProductForm
                initial={{ name: p.name, color: p.color }}
                onSave={(name, color) => handleUpdate(p.id, name, color)}
                onCancel={() => setEditId(null)}
              />
            ) : (
              <div className="flex items-center gap-3">
                <span
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="flex-1 text-sm font-medium">{p.name}</span>
                <button
                  onClick={() => setEditId(p.id)}
                  className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        ))}

        {showNew && (
          <div className="px-4 py-3">
            <ProductForm
              initial={{ name: '', color: COLORS[0] }}
              onSave={handleCreate}
              onCancel={() => setShowNew(false)}
            />
          </div>
        )}
      </div>
    </section>
  )
}

function ProductForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: { name: string; color: string }
  onSave: (name: string, color: string) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [color, setColor] = useState(initial.color)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try { await onSave(name.trim(), color) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-3 flex-wrap">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre del producto"
        className="border rounded px-3 py-1.5 text-sm flex-1 min-w-40 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        autoFocus
      />
      <div className="flex gap-1.5 flex-wrap">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-slate-700 scale-110' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? '...' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-600 px-2">
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ─── Developers ──────────────────────────────────────────────────────────────

function DevelopersSection() {
  const queryClient = useQueryClient()
  const { data: developers = [], isLoading: loading } = useQuery({ queryKey: QUERY_KEYS.developers, queryFn: getDevelopers, staleTime: STALE_TIMES.developers })
  const [editId, setEditId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  async function handleCreate(name: string, capacity: number) {
    await createDeveloper({ name, capacityPerSprint: capacity })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.developers })
    setShowNew(false)
  }

  async function handleUpdate(id: string, name: string, capacity: number) {
    await patchDeveloper(id, { name, capacityPerSprint: capacity })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.developers })
    setEditId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este developer?')) return
    await deleteDeveloper(id)
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.developers })
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium">Developers</h2>
        <button
          onClick={() => setShowNew(true)}
          className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700"
        >
          + Nuevo developer
        </button>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Nombre</th>
              <th className="text-right px-4 py-2.5 font-medium w-40">Capacidad / sprint</th>
              <th className="px-4 py-2.5 w-28" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={3} className="text-slate-400 text-sm px-4 py-3">Cargando...</td></tr>
            ) : developers.length === 0 && !showNew ? (
              <tr><td colSpan={3} className="text-slate-400 text-sm px-4 py-3">Sin developers registrados.</td></tr>
            ) : null}

            {developers.map((d) => (
              <tr key={d.id}>
                {editId === d.id ? (
                  <td colSpan={3} className="px-4 py-2">
                    <DeveloperForm
                      initial={{ name: d.name, capacity: d.capacityPerSprint }}
                      onSave={(name, capacity) => handleUpdate(d.id, name, capacity)}
                      onCancel={() => setEditId(null)}
                    />
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2.5 font-medium">{d.name}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {d.capacityPerSprint > 0 ? d.capacityPerSprint : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => setEditId(d.id)}
                        className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
                      >
                        Eliminar
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {showNew && (
              <tr>
                <td colSpan={3} className="px-4 py-2">
                  <DeveloperForm
                    initial={{ name: '', capacity: 0 }}
                    onSave={handleCreate}
                    onCancel={() => setShowNew(false)}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DeveloperForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: { name: string; capacity: number }
  onSave: (name: string, capacity: number) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [capacity, setCapacity] = useState(String(initial.capacity || ''))
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try { await onSave(name.trim(), Number(capacity) || 0) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre del developer"
        className="border rounded px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        autoFocus
      />
      <input
        type="number"
        min="0"
        step="0.5"
        value={capacity}
        onChange={(e) => setCapacity(e.target.value)}
        placeholder="Capacidad"
        className="border rounded px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? '...' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-600 px-2">
          Cancelar
        </button>
      </div>
    </form>
  )
}
