import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { previewImport, commitImport, getConfig, patchConfig } from '@/api/client'
import type { ImportPreviewResult, AppConfig, CsvMappingProfile } from '@/domain/types'
import { randomUUID } from '@/lib/uuid'

type Step = 'upload' | 'map' | 'preview' | 'done'

export default function ImportScreen() {
  const [step, setStep] = useState<Step>('upload')
  const [csvContent, setCsvContent] = useState('')
  const [filename, setFilename] = useState('import.csv')
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Mapping profiles
  const [profiles, setProfiles] = useState<CsvMappingProfile[]>([])
  const [newProfileName, setNewProfileName] = useState('')
  const [showSaveProfile, setShowSaveProfile] = useState(false)

  useEffect(() => {
    getConfig().then((cfg: AppConfig) => setProfiles(cfg.csvMappingProfiles ?? []))
  }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    const text = await file.text()
    setCsvContent(text)
    setError(null)
  }

  async function handlePreview() {
    if (!csvContent) { setError('Seleccioná un archivo CSV primero'); return }
    setLoading(true)
    setError(null)
    try {
      const result = await previewImport(csvContent, mappings)
      setPreview(result)
      setMappings(result.suggestedMappings)
      setStep('map')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleCommit() {
    if (!csvContent) return
    setLoading(true)
    setError(null)
    try {
      const r = await commitImport(csvContent, mappings, filename)
      setResult({ created: r.created, updated: r.updated, skipped: r.skipped })
      setStep('done')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveProfile() {
    if (!newProfileName.trim()) return
    const profile: CsvMappingProfile = {
      id: randomUUID(),
      name: newProfileName.trim(),
      mappings,
      encoding: 'UTF-8',
    }
    const updated = [...profiles, profile]
    await patchConfig({ csvMappingProfiles: updated })
    setProfiles(updated)
    setNewProfileName('')
    setShowSaveProfile(false)
  }

  function handleLoadProfile(profile: CsvMappingProfile) {
    setMappings(profile.mappings)
  }

  async function handleDeleteProfile(id: string) {
    const updated = profiles.filter((p) => p.id !== id)
    await patchConfig({ csvMappingProfiles: updated })
    setProfiles(updated)
  }

  function reset() {
    setStep('upload')
    setCsvContent('')
    setMappings({})
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Importar CSV</h1>

      {/* Step indicator */}
      <div className="flex gap-2 text-sm">
        {(['upload', 'map', 'preview', 'done'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-300">›</span>}
            <span className={step === s ? 'font-medium text-indigo-600' : 'text-slate-400'}>
              {s === 'upload' ? '1. Archivo' : s === 'map' ? '2. Columnas' : s === 'preview' ? '3. Preview' : '4. Listo'}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 text-sm">{error}</div>
      )}

      {step === 'upload' && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center space-y-4">
            <p className="text-slate-500">Seleccioná el CSV exportado desde Microsoft Lists</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block mx-auto text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {csvContent && (
              <p className="text-green-600 text-sm">✓ {filename} cargado ({csvContent.split('\n').length - 1} filas)</p>
            )}
            <button
              onClick={handlePreview}
              disabled={!csvContent || loading}
              className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Analizando...' : 'Analizar columnas →'}
            </button>
          </div>

          {profiles.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-2 font-medium">Perfiles de mapeo guardados</p>
              <div className="flex flex-wrap gap-2">
                {profiles.map((p) => (
                  <div key={p.id} className="flex items-center gap-1 bg-white border rounded px-3 py-1.5 text-sm">
                    <span>{p.name}</span>
                    <button
                      onClick={() => { setMappings(p.mappings); handlePreview() }}
                      className="text-indigo-600 hover:text-indigo-800 ml-1 text-xs"
                      title="Cargar y previsualizar"
                    >
                      Usar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'map' && preview && (
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Mapeo de columnas</h2>
              <div className="flex gap-2">
                {profiles.length > 0 && (
                  <select
                    className="border rounded px-2 py-1 text-xs bg-white"
                    defaultValue=""
                    onChange={(e) => {
                      const p = profiles.find((x) => x.id === e.target.value)
                      if (p) handleLoadProfile(p)
                    }}
                  >
                    <option value="">Cargar perfil…</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => setShowSaveProfile(!showSaveProfile)}
                  className="text-xs border rounded px-3 py-1 bg-white hover:bg-slate-100"
                >
                  Guardar perfil
                </button>
              </div>
            </div>

            {showSaveProfile && (
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="Nombre del perfil (ej: Microsoft Lists ES)"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <button
                  onClick={handleSaveProfile}
                  disabled={!newProfileName.trim()}
                  className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  Guardar
                </button>
                <button
                  onClick={() => setShowSaveProfile(false)}
                  className="text-slate-400 px-2 hover:text-slate-600 text-sm"
                >
                  Cancelar
                </button>
              </div>
            )}

            {profiles.length > 0 && showSaveProfile && (
              <div className="mb-4 flex flex-wrap gap-1">
                <span className="text-xs text-slate-400">Perfiles guardados:</span>
                {profiles.map((p) => (
                  <span key={p.id} className="flex items-center gap-1 text-xs bg-white border rounded px-2 py-0.5">
                    {p.name}
                    <button onClick={() => handleDeleteProfile(p.id)} className="text-red-400 hover:text-red-600 ml-1">×</button>
                  </span>
                ))}
              </div>
            )}

            <p className="text-sm text-slate-500 mb-4">
              Se detectaron {preview.detectedColumns.length} columnas. Verificá el mapeo a campos internos.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {preview.detectedColumns.map((col) => (
                <div key={col} className="flex items-center gap-3">
                  <span className="flex-1 text-slate-600 truncate" title={col}>{col}</span>
                  <span className="text-slate-300">→</span>
                  <select
                    value={mappings[col] ?? ''}
                    onChange={(e) => setMappings({ ...mappings, [col]: e.target.value })}
                    className="flex-1 border rounded px-2 py-1 text-xs bg-white"
                  >
                    <option value="">(ignorar)</option>
                    {INTERNAL_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('upload')} className="border px-4 py-2 rounded hover:bg-slate-50 text-sm">
              ← Volver
            </button>
            <button
              onClick={() => setStep('preview')}
              className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 text-sm"
            >
              Ver preview →
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="bg-slate-50 rounded p-3 text-sm text-slate-600">
            {preview.rows.length} filas a importar
            {preview.errors.length > 0 && (
              <span className="ml-3 text-amber-600">{preview.errors.length} advertencias</span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="text-sm w-full">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Título</th>
                  <th className="text-left px-3 py-2 font-medium">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium">Prioridad</th>
                  <th className="text-left px-3 py-2 font-medium">Estado</th>
                  <th className="text-left px-3 py-2 font-medium">Producto</th>
                  <th className="text-left px-3 py-2 font-medium">Asignados</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 max-w-xs truncate" title={row.title}>{row.title}</td>
                    <td className="px-3 py-2">{row.itemType ?? '-'}</td>
                    <td className="px-3 py-2">{row.priority ?? '-'}</td>
                    <td className="px-3 py-2">{row.status ?? '-'}</td>
                    <td className="px-3 py-2">{(row as Record<string, unknown>)['_productName'] as string ?? '-'}</td>
                    <td className="px-3 py-2">{(row.assigneeIds ?? []).join(', ') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 50 && (
              <p className="text-slate-400 text-xs px-3 py-2">... y {preview.rows.length - 50} filas más</p>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('map')} className="border px-4 py-2 rounded hover:bg-slate-50 text-sm">
              ← Volver
            </button>
            <button
              onClick={handleCommit}
              disabled={loading}
              className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50 text-sm"
            >
              {loading ? 'Importando...' : `Importar ${preview.rows.length} items`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="text-center space-y-4 py-8">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-semibold">Importación completada</h2>
          <div className="flex justify-center gap-8 text-sm">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{result.created}</p>
              <p className="text-slate-500">Creados</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
              <p className="text-slate-500">Actualizados</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-400">{result.skipped}</p>
              <p className="text-slate-500">Sin cambios</p>
            </div>
          </div>
          <div className="flex justify-center gap-3">
            <button onClick={reset} className="border px-4 py-2 rounded hover:bg-slate-50 text-sm">
              Importar otro archivo
            </button>
            <Link to="/" className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 text-sm">
              Ver backlog →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

const INTERNAL_FIELDS = [
  { value: 'externalId', label: 'ID externo' },
  { value: 'title', label: 'Título' },
  { value: 'description', label: 'Descripción' },
  { value: 'itemType', label: 'Tipo de item' },
  { value: 'productName', label: 'Producto/Proyecto' },
  { value: 'feature', label: 'Funcionalidad' },
  { value: 'status', label: 'Estado' },
  { value: 'priority', label: 'Prioridad' },
  { value: 'assigneeNames', label: 'Asignados' },
  { value: 'categories', label: 'Categorías' },
  { value: 'startDate', label: 'Fecha inicio' },
  { value: 'dueDate', label: 'Fecha vencimiento' },
  { value: 'reportDate', label: 'Fecha reporte' },
  { value: 'effortStoryPoints', label: 'Story Points' },
  { value: 'effortQuotedHours', label: 'Hs Cotizadas' },
  { value: 'effortEstimatedHours', label: 'Hs Estimadas' },
  { value: 'effortActualHours', label: 'Hs Reales' },
  { value: 'service', label: 'Servicio' },
  { value: 'version', label: 'Versión' },
  { value: 'client', label: 'Cliente' },
  { value: 'notes', label: 'Notas' },
  { value: 'prodChanges', label: 'Cambios para prod' },
  { value: 'createdBy', label: 'Creado por' },
  { value: 'createdAt', label: 'Fecha creación' },
  { value: 'updatedAt', label: 'Fecha modificación' },
  { value: 'relatedItemId', label: 'Item asociado ID' },
  { value: 'helpDeskId', label: 'Mesa de ayudas ID' },
]
