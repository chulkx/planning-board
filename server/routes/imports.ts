import { Router } from 'express'
import db from '../db.js'
import { previewImport, commitImport } from '../services/importService.js'

export const importsRouter = Router()

importsRouter.post('/preview', (req, res) => {
  const { csvContent, mappings = {} } = req.body as { csvContent: string; mappings?: Record<string, string> }
  if (!csvContent) {
    res.status(400).json({ error: 'csvContent is required' })
    return
  }
  const result = previewImport(csvContent, mappings)
  res.json(result)
})

importsRouter.post('/commit', (req, res) => {
  const { csvContent, mappings = {}, filename = 'import.csv' } = req.body as {
    csvContent: string
    mappings?: Record<string, string>
    filename?: string
  }
  if (!csvContent) {
    res.status(400).json({ error: 'csvContent is required' })
    return
  }
  const result = commitImport(filename, csvContent, mappings)
  res.json(result)
})

importsRouter.get('/history', (_req, res) => {
  const rows = db.prepare('SELECT * FROM import_snapshots ORDER BY imported_at DESC').all() as Record<string, unknown>[]
  res.json(rows.map((r) => ({
    id: r.id,
    importedAt: r.imported_at,
    filename: r.filename,
    totalRows: r.total_rows,
    createdCount: r.created_count,
    updatedCount: r.updated_count,
    skippedCount: r.skipped_count,
    errors: JSON.parse(r.errors as string ?? '[]'),
  })))
})
