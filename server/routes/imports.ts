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
  const backup = req.body as Record<string, Record<string, unknown>[]>

  if (!backup || typeof backup !== 'object') {
    res.status(400).json({ error: 'Invalid backup format' })
    return
  }

  const restore = db.transaction(() => {
    // Clear in FK-safe order
    for (const table of [
      'saved_views', 'item_events', 'sprint_daily_snapshots',
      'sprint_capacity', 'retrospectives', 'sprint_product_metrics',
      'backlog_items', 'sprints', 'milestones', 'developers', 'products',
    ]) {
      db.prepare(`DELETE FROM ${table}`).run()
    }

    for (const p of backup.products ?? []) {
      db.prepare('INSERT OR IGNORE INTO products (id, name, color, board_columns, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(p.id, p.name, p.color, p.board_columns ?? '[]', p.created_at ?? new Date().toISOString())
    }
    for (const d of backup.developers ?? []) {
      db.prepare('INSERT OR IGNORE INTO developers (id, name, capacity_per_sprint, created_at) VALUES (?, ?, ?, ?)')
        .run(d.id, d.name, d.capacity_per_sprint ?? 0, d.created_at ?? new Date().toISOString())
    }
    for (const s of backup.sprints ?? []) {
      db.prepare('INSERT OR IGNORE INTO sprints (id, name, start_date, end_date, product_ids, status, effort_unit, sprint_goal, committed_story_points, completed_story_points, closed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(s.id, s.name, s.start_date ?? null, s.end_date ?? null, s.product_ids ?? '[]', s.status ?? 'planned', s.effort_unit ?? 'story-points', s.sprint_goal ?? null, s.committed_story_points ?? null, s.completed_story_points ?? null, s.closed_at ?? null, s.created_at ?? new Date().toISOString())
    }
    for (const m of backup.milestones ?? []) {
      db.prepare('INSERT OR IGNORE INTO milestones (id, name, target_date, product_ids, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(m.id, m.name, m.target_date ?? null, m.product_ids ?? '[]', m.status ?? 'planned', m.created_at ?? new Date().toISOString())
    }
    const insertItem = db.prepare(`INSERT OR IGNORE INTO backlog_items (
      id, external_id, title, description, item_type, product_id, feature,
      status, priority, assignee_ids, sprint_id, milestone_id, categories,
      service, version, client, start_date, due_date, report_date,
      effort_story_points, effort_quoted_hours, effort_estimated_hours, effort_actual_hours,
      notes, prod_changes, related_item_id, related_item_title, parent_id,
      help_desk_id, help_desk_title, created_by, created_at, updated_at,
      imported_at, import_hash, manual_overrides, raw_fields, sort_order
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const item of backup.backlogItems ?? []) {
      insertItem.run(
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
        item.related_item_title ?? null, item.parent_id ?? null,
        item.help_desk_id ?? null, item.help_desk_title ?? null,
        item.created_by ?? null, item.created_at ?? new Date().toISOString(),
        item.updated_at ?? new Date().toISOString(), item.imported_at ?? null,
        item.import_hash ?? null, item.manual_overrides ?? null,
        item.raw_fields ?? null, item.sort_order ?? null,
      )
    }
    // R1+ tables
    for (const e of backup.itemEvents ?? []) {
      db.prepare('INSERT OR IGNORE INTO item_events (id, item_id, event_type, field, old_value, new_value, source, actor, metadata, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(e.id, e.item_id, e.event_type, e.field ?? null, e.old_value ?? null, e.new_value ?? null, e.source ?? 'system', e.actor ?? null, e.metadata ?? null, e.created_at ?? new Date().toISOString())
    }
    for (const sc of backup.sprintCapacity ?? []) {
      db.prepare('INSERT OR IGNORE INTO sprint_capacity (id, sprint_id, developer_id, capacity_hours, capacity_story_points, notes, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(sc.id, sc.sprint_id, sc.developer_id, sc.capacity_hours ?? 0, sc.capacity_story_points ?? null, sc.notes ?? null, sc.created_at ?? new Date().toISOString())
    }
    for (const r of backup.retrospectives ?? []) {
      db.prepare('INSERT OR IGNORE INTO retrospectives (id, sprint_id, went_well, to_improve, action_items, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(r.id, r.sprint_id, r.went_well ?? null, r.to_improve ?? null, r.action_items ?? '[]', r.created_at ?? new Date().toISOString(), r.updated_at ?? new Date().toISOString())
    }
    for (const sv of backup.savedViews ?? []) {
      db.prepare('INSERT OR IGNORE INTO saved_views (id, name, screen, filters, created_at) VALUES (?,?,?,?,?)')
        .run(sv.id, sv.name, sv.screen, sv.filters ?? '{}', sv.created_at ?? new Date().toISOString())
    }

    if (backup.config) {
      const c = backup.config as Record<string, unknown>
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

  try {
    restore()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
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
