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

importsRouter.post('/restore', (req, res) => {
  const backup = req.body as {
    products?: Record<string, unknown>[]
    developers?: Record<string, unknown>[]
    sprints?: Record<string, unknown>[]
    milestones?: Record<string, unknown>[]
    backlogItems?: Record<string, unknown>[]
    config?: Record<string, unknown>
  }

  if (!backup || typeof backup !== 'object') {
    res.status(400).json({ error: 'Invalid backup format' })
    return
  }

  const restore = db.transaction(() => {
    // Clear existing data (order respects foreign keys)
    db.prepare('DELETE FROM backlog_items').run()
    db.prepare('DELETE FROM sprints').run()
    db.prepare('DELETE FROM milestones').run()
    db.prepare('DELETE FROM developers').run()
    db.prepare('DELETE FROM products').run()

    for (const p of backup.products ?? []) {
      db.prepare('INSERT OR IGNORE INTO products (id, name, color, board_columns, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(p.id, p.name, p.color, p.board_columns ?? '["not-started","in-progress","review","done"]', p.created_at ?? new Date().toISOString())
    }
    for (const d of backup.developers ?? []) {
      db.prepare('INSERT OR IGNORE INTO developers (id, name, capacity_per_sprint, created_at) VALUES (?, ?, ?, ?)')
        .run(d.id, d.name, d.capacity_per_sprint ?? 0, d.created_at ?? new Date().toISOString())
    }
    for (const s of backup.sprints ?? []) {
      db.prepare('INSERT OR IGNORE INTO sprints (id, name, start_date, end_date, product_ids, status, effort_unit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(s.id, s.name, s.start_date ?? null, s.end_date ?? null, s.product_ids ?? '[]', s.status ?? 'planned', s.effort_unit ?? 'story-points', s.created_at ?? new Date().toISOString())
    }
    for (const m of backup.milestones ?? []) {
      db.prepare('INSERT OR IGNORE INTO milestones (id, name, target_date, product_ids, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(m.id, m.name, m.target_date ?? null, m.product_ids ?? '[]', m.status ?? 'planned', m.created_at ?? new Date().toISOString())
    }
    for (const item of backup.backlogItems ?? []) {
      db.prepare(`INSERT OR IGNORE INTO backlog_items (
        id, external_id, title, description, item_type, product_id, feature,
        status, priority, assignee_ids, sprint_id, milestone_id, categories,
        service, version, client, start_date, due_date, report_date,
        effort_story_points, effort_quoted_hours, effort_estimated_hours, effort_actual_hours,
        notes, prod_changes, related_item_id, related_item_title,
        help_desk_id, help_desk_title, created_by, created_at, updated_at,
        imported_at, import_hash, manual_overrides, raw_fields
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      )`).run(
        item.id, item.external_id ?? null, item.title, item.description ?? null,
        item.item_type ?? 'task', item.product_id ?? null, item.feature ?? null,
        item.status ?? 'not-started', item.priority ?? 'medium',
        item.assignee_ids ?? '[]', item.sprint_id ?? null, item.milestone_id ?? null,
        item.categories ?? '[]', item.service ?? null, item.version ?? null,
        item.client ?? null, item.start_date ?? null, item.due_date ?? null,
        item.report_date ?? null, item.effort_story_points ?? null,
        item.effort_quoted_hours ?? null, item.effort_estimated_hours ?? null,
        item.effort_actual_hours ?? null, item.notes ?? null,
        item.prod_changes ?? null, item.related_item_id ?? null,
        item.related_item_title ?? null, item.help_desk_id ?? null,
        item.help_desk_title ?? null, item.created_by ?? null,
        item.created_at ?? null, item.updated_at ?? null,
        item.imported_at ?? new Date().toISOString(),
        item.import_hash ?? null, item.manual_overrides ?? '[]',
        item.raw_fields ?? '{}'
      )
    }
    if (backup.config) {
      const c = backup.config
      db.prepare(`UPDATE app_config SET
        default_effort_unit = ?, csv_mapping_profiles = ?, import_hash_fields = ?
        WHERE id = 'singleton'`)
        .run(
          c.default_effort_unit ?? 'story-points',
          c.csv_mapping_profiles ?? '[]',
          c.import_hash_fields ?? '["title","productName"]'
        )
    }
  })

  restore()

  res.json({
    products: (backup.products ?? []).length,
    developers: (backup.developers ?? []).length,
    sprints: (backup.sprints ?? []).length,
    milestones: (backup.milestones ?? []).length,
    backlogItems: (backup.backlogItems ?? []).length,
  })
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
