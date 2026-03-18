import { useEffect, useState } from 'react'
import {
  getProducts, createProduct, patchProduct, deleteProduct,
  getDevelopers, createDeveloper, patchDeveloper, deleteDeveloper,
  getImportHistory,
} from '@/api/client'
import type { Product, Developer, ImportSnapshot } from '@/domain/types'

const COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#3b82f6',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#84cc16',
]

export default function SettingsScreen() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <ExportSection />
      <ProductsSection />
      <DevelopersSection />
      <ImportHistorySection />
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

function ExportSection() {
  function handleExport() {
    window.location.href = '/api/exports/json'
  }

  return (
    <section>
      <h2 className="text-lg font-medium mb-3">Backup</h2>
      <div className="border rounded-lg bg-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Exportar JSON completo</p>
          <p className="text-xs text-slate-500 mt-0.5">Descarga todos los datos (productos, items, developers, sprints, milestones).</p>
        </div>
        <button
          onClick={handleExport}
          className="text-sm bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700"
        >
          Descargar backup
        </button>
      </div>
    </section>
  )
}

// ─── Import History ───────────────────────────────────────────────────────────

function ImportHistorySection() {
  const [history, setHistory] = useState<ImportSnapshot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getImportHistory().then(setHistory).finally(() => setLoading(false))
  }, [])

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
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    getProducts().then(setProducts).finally(() => setLoading(false))
  }, [])

  async function handleCreate(name: string, color: string) {
    const p = await createProduct({ name, color })
    setProducts((prev) => [...prev, p])
    setShowNew(false)
  }

  async function handleUpdate(id: string, name: string, color: string) {
    const p = await patchProduct(id, { name, color })
    setProducts((prev) => prev.map((x) => x.id === id ? p : x))
    setEditId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este producto? Los items quedarán sin producto asignado.')) return
    await deleteProduct(id)
    setProducts((prev) => prev.filter((x) => x.id !== id))
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
  const [developers, setDevelopers] = useState<Developer[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    getDevelopers().then(setDevelopers).finally(() => setLoading(false))
  }, [])

  async function handleCreate(name: string, capacity: number) {
    const d = await createDeveloper({ name, capacityPerSprint: capacity })
    setDevelopers((prev) => [...prev, d])
    setShowNew(false)
  }

  async function handleUpdate(id: string, name: string, capacity: number) {
    const d = await patchDeveloper(id, { name, capacityPerSprint: capacity })
    setDevelopers((prev) => prev.map((x) => x.id === id ? d : x))
    setEditId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este developer?')) return
    await deleteDeveloper(id)
    setDevelopers((prev) => prev.filter((x) => x.id !== id))
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
