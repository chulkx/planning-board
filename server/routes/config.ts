import { Router } from 'express'
import db from '../db.js'

export const configRouter = Router()

function deserialize(row: Record<string, unknown>) {
  return {
    id: row.id,
    defaultEffortUnit: row.default_effort_unit,
    csvMappingProfiles: JSON.parse(row.csv_mapping_profiles as string ?? '[]'),
    importHashFields: JSON.parse(row.import_hash_fields as string ?? '[]'),
  }
}

configRouter.get('/', (_req, res) => {
  const row = db.prepare('SELECT * FROM app_config WHERE id = ?').get('singleton') as Record<string, unknown>
  res.json(deserialize(row))
})

configRouter.patch('/', (req, res) => {
  const { defaultEffortUnit, csvMappingProfiles, importHashFields } = req.body as Record<string, unknown>
  const sets: string[] = []
  const vals: unknown[] = []
  if (defaultEffortUnit) { sets.push('default_effort_unit = ?'); vals.push(defaultEffortUnit) }
  if (csvMappingProfiles) { sets.push('csv_mapping_profiles = ?'); vals.push(JSON.stringify(csvMappingProfiles)) }
  if (importHashFields) { sets.push('import_hash_fields = ?'); vals.push(JSON.stringify(importHashFields)) }
  if (sets.length > 0) {
    vals.push('singleton')
    db.prepare(`UPDATE app_config SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  }
  const row = db.prepare('SELECT * FROM app_config WHERE id = ?').get('singleton') as Record<string, unknown>
  res.json(deserialize(row))
})
