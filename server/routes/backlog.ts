import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'
import type { BacklogItem } from '../../src/domain/types.js'

export const backlogRouter = Router()

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function parseJsonObject(value: unknown): Record<string, string> {
  if (typeof value !== 'string' || value.trim() === '') return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).map(([key, entryValue]) => [key, String(entryValue ?? '')])
    )
  } catch {
    return {}
  }
}

function deserializeItem(row: Record<string, unknown>): BacklogItem {
  return {
    id: row.id as string,
    externalId: row.external_id as string | null,
    title: row.title as string,
    description: row.description as string | null,
    itemType: row.item_type as BacklogItem['itemType'],
    productId: row.product_id as string | null,
    feature: row.feature as string | null,
    status: row.status as BacklogItem['status'],
    priority: row.priority as BacklogItem['priority'],
    assigneeIds: parseJsonArray(row.assignee_ids),
    sprintId: row.sprint_id as string | null,
    milestoneId: row.milestone_id as string | null,
    categories: parseJsonArray(row.categories),
    service: row.service as string | null,
    version: row.version as string | null,
    client: row.client as string | null,
    startDate: row.start_date as string | null,
    dueDate: row.due_date as string | null,
    reportDate: row.report_date as string | null,
    effortStoryPoints: row.effort_story_points as number | null,
    effortQuotedHours: row.effort_quoted_hours as number | null,
    effortEstimatedHours: row.effort_estimated_hours as number | null,
    effortActualHours: row.effort_actual_hours as number | null,
    notes: row.notes as string | null,
    prodChanges: row.prod_changes as string | null,
    relatedItemId: row.related_item_id as string | null,
    relatedItemTitle: row.related_item_title as string | null,
    parentId: row.parent_id as string | null,
    helpDeskId: row.help_desk_id as string | null,
    helpDeskTitle: row.help_desk_title as string | null,
    createdBy: row.created_by as string | null,
    createdAt: row.created_at as string | null,
    updatedAt: row.updated_at as string | null,
    importedAt: row.imported_at as string,
    importHash: row.import_hash as string | null,
    manualOverrides: parseJsonArray(row.manual_overrides),
    rawFields: parseJsonObject(row.raw_fields),
    sortOrder: row.sort_order as number | null,
  }
}

backlogRouter.get('/', (req, res) => {
  const { productId, status, priority, assigneeId, sprintId, milestoneId, search } = req.query as Record<string, string>

  let query = 'SELECT * FROM backlog_items WHERE 1=1'
  const params: unknown[] = []

  if (productId) { query += ' AND product_id = ?'; params.push(productId) }
  if (status) { query += ' AND status = ?'; params.push(status) }
  if (priority) { query += ' AND priority = ?'; params.push(priority) }
  if (sprintId === 'null') { query += ' AND sprint_id IS NULL' }
  else if (sprintId) { query += ' AND sprint_id = ?'; params.push(sprintId) }
  if (milestoneId) { query += ' AND milestone_id = ?'; params.push(milestoneId) }
  if (assigneeId) { query += ' AND assignee_ids LIKE ?'; params.push(`%${assigneeId}%`) }
  if (search) {
    query += ' AND (title LIKE ? OR description LIKE ?)'
    params.push(`%${search}%`, `%${search}%`)
  }

  query += ' ORDER BY COALESCE(sort_order, 999999), created_at DESC'

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[]
  res.json(rows.map(deserializeItem))
})

// Must be registered before /:id so Express doesn't treat 'reorder' as an id param
backlogRouter.patch('/reorder', (req, res) => {
  const { ids } = req.body as { ids?: string[] }
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids array is required' })
    return
  }
  const update = db.prepare('UPDATE backlog_items SET sort_order = ? WHERE id = ?')
  db.transaction(() => {
    ids.forEach((id, index) => update.run(index, id))
  })()
  res.status(204).end()
})

backlogRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!row) { res.status(404).json({ error: 'Not found' }); return }
  res.json(deserializeItem(row))
})

backlogRouter.patch('/:id/parent', (req, res) => {
  const item = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!item) { res.status(404).json({ error: 'Not found' }); return }

  const { parentId } = req.body as { parentId: string | null }

  if (parentId != null) {
    // Validate parent exists
    const parent = db.prepare('SELECT id, item_type, parent_id FROM backlog_items WHERE id = ?').get(parentId) as Record<string, unknown> | undefined
    if (!parent) { res.status(400).json({ error: 'Parent not found' }); return }

    // Check for cycles: walk up from parentId, ensure we never hit req.params.id
    let cur: string | null = parentId
    while (cur != null) {
      if (cur === req.params.id) { res.status(400).json({ error: 'Circular hierarchy not allowed' }); return }
      const row = db.prepare('SELECT parent_id FROM backlog_items WHERE id = ?').get(cur) as { parent_id: string | null } | undefined
      cur = row?.parent_id ?? null
    }
  }

  db.prepare('UPDATE backlog_items SET parent_id = ?, updated_at = ? WHERE id = ?').run(parentId ?? null, new Date().toISOString(), req.params.id)
  res.json(deserializeItem(db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(req.params.id) as Record<string, unknown>))
})

backlogRouter.get('/:id/events', (req, res) => {
  const events = db.prepare(`
    SELECT * FROM item_events WHERE item_id = ? ORDER BY created_at ASC
  `).all(req.params.id) as Record<string, unknown>[]
  res.json(events.map(e => ({
    id: e.id, itemId: e.item_id, eventType: e.event_type,
    field: e.field, oldValue: e.old_value, newValue: e.new_value,
    source: e.source, actor: e.actor,
    metadata: e.metadata ? JSON.parse(e.metadata as string) : null,
    createdAt: e.created_at,
  })))
})

backlogRouter.patch('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!item) { res.status(404).json({ error: 'Not found' }); return }

  const updates = req.body as Partial<BacklogItem>
  const manualOverrides = parseJsonArray(item.manual_overrides)

  // Track which fields are being manually overridden
  const overridableFields = ['title', 'description', 'status', 'priority', 'assigneeIds', 'feature', 'notes']
  for (const field of overridableFields) {
    if (field in updates && !manualOverrides.includes(field)) {
      manualOverrides.push(field)
    }
  }

  const fieldMap: Record<string, string> = {
    title: 'title',
    description: 'description',
    itemType: 'item_type',
    productId: 'product_id',
    feature: 'feature',
    status: 'status',
    priority: 'priority',
    sprintId: 'sprint_id',
    milestoneId: 'milestone_id',
    service: 'service',
    version: 'version',
    client: 'client',
    startDate: 'start_date',
    dueDate: 'due_date',
    effortStoryPoints: 'effort_story_points',
    effortQuotedHours: 'effort_quoted_hours',
    effortEstimatedHours: 'effort_estimated_hours',
    effortActualHours: 'effort_actual_hours',
    notes: 'notes',
  }

  const setClauses: string[] = ['updated_at = ?', 'manual_overrides = ?']
  const values: unknown[] = [new Date().toISOString(), JSON.stringify(manualOverrides)]

  for (const [jsField, dbField] of Object.entries(fieldMap)) {
    if (jsField in updates) {
      setClauses.push(`${dbField} = ?`)
      values.push((updates as Record<string, unknown>)[jsField] ?? null)
    }
  }

  if ('assigneeIds' in updates) {
    setClauses.push('assignee_ids = ?')
    values.push(JSON.stringify(updates.assigneeIds ?? []))
  }
  if ('categories' in updates) {
    setClauses.push('categories = ?')
    values.push(JSON.stringify(updates.categories ?? []))
  }

  values.push(req.params.id)
  db.prepare(`UPDATE backlog_items SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

  // Record item_events for changed fields
  const trackFields: Array<{ jsKey: string; eventType: string; field: string }> = [
    { jsKey: 'status',     eventType: 'status_changed',   field: 'status' },
    { jsKey: 'priority',   eventType: 'priority_changed', field: 'priority' },
    { jsKey: 'sprintId',   eventType: 'sprint_changed',   field: 'sprintId' },
    { jsKey: 'assigneeIds',eventType: 'assigned',         field: 'assigneeIds' },
  ]
  for (const { jsKey, eventType, field } of trackFields) {
    if (!(jsKey in updates)) continue
    const oldVal = jsKey === 'assigneeIds'
      ? parseJsonArray(item.assignee_ids)
      : item[jsKey === 'sprintId' ? 'sprint_id' : jsKey === 'priority' ? 'priority' : 'status']
    const newVal = (updates as Record<string, unknown>)[jsKey]
    const oldStr = JSON.stringify(oldVal)
    const newStr = JSON.stringify(newVal)
    if (oldStr !== newStr) {
      db.prepare(`
        INSERT INTO item_events (id, item_id, event_type, field, old_value, new_value, source)
        VALUES (?, ?, ?, ?, ?, ?, 'user')
      `).run(randomUUID(), req.params.id, eventType, field, oldStr, newStr)
    }
  }

  // Autoestado: if actual hours recorded but status still not-started, promote to in-progress
  const afterPatch = db.prepare('SELECT status, effort_actual_hours FROM backlog_items WHERE id = ?').get(req.params.id) as { status: string; effort_actual_hours: number | null }
  if (afterPatch.status === 'not-started' && (afterPatch.effort_actual_hours ?? 0) > 0) {
    db.prepare("UPDATE backlog_items SET status = 'in-progress', updated_at = ? WHERE id = ?").run(new Date().toISOString(), req.params.id)
    db.prepare(`INSERT INTO item_events (id, item_id, event_type, field, old_value, new_value, source) VALUES (?, ?, 'status_changed', 'status', '"not-started"', '"in-progress"', 'automation')`).run(randomUUID(), req.params.id)
  }

  const updated = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(req.params.id) as Record<string, unknown>
  const result = deserializeItem(updated)

  // WIP check: if status was changed, check WIP limit for the target column
  let wip: { exceeded: boolean; current: number; limit: number } | undefined
  if ('status' in updates && updates.status) {
    const targetStatus = (result as BacklogItem).status
    const productId = (result as BacklogItem).productId
    if (productId) {
      const prod = db.prepare('SELECT board_columns FROM products WHERE id = ?').get(productId) as { board_columns: string } | undefined
      if (prod) {
        let cols: Array<{ name: string; wipLimit: number | null }> = []
        try {
          const parsed = JSON.parse(prod.board_columns ?? '[]') as Array<string | { name: string; wipLimit: number | null }>
          cols = Array.isArray(parsed)
            ? parsed.map((column) => typeof column === 'string'
              ? { name: column, wipLimit: null }
              : { name: column.name, wipLimit: column.wipLimit ?? null })
            : []
        } catch {
          cols = []
        }
        const col = cols.find(c => c.name === targetStatus)
        if (col && col.wipLimit != null) {
          const count = (db.prepare('SELECT COUNT(*) as cnt FROM backlog_items WHERE product_id = ? AND status = ?').get(productId, targetStatus) as { cnt: number }).cnt
          wip = { exceeded: count > col.wipLimit, current: count, limit: col.wipLimit }
        }
      }
    }
  }

  res.json(wip ? { ...result, wip } : result)
})

// DELETE /api/v1/backlog-items — elimina todos los items del backlog
backlogRouter.delete('/', (_req, res) => {
  db.prepare('DELETE FROM backlog_items').run()
  res.status(204).end()
})
