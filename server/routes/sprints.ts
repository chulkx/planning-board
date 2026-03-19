import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

export const sprintsRouter = Router()

function deserialize(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    productIds: JSON.parse(row.product_ids as string ?? '[]'),
    status: row.status,
    effortUnit: row.effort_unit,
    createdAt: row.created_at,
  }
}

sprintsRouter.get('/', (_req, res) => {
  res.json((db.prepare('SELECT * FROM sprints ORDER BY start_date DESC').all() as Record<string, unknown>[]).map(deserialize))
})

sprintsRouter.post('/', (req, res) => {
  const { name, startDate, endDate, productIds = [], status = 'planned', effortUnit = 'story-points' } = req.body as {
    name: string; startDate?: string; endDate?: string; productIds?: string[]; status?: string; effortUnit?: string
  }
  if (!name) { res.status(400).json({ error: 'name is required' }); return }
  const id = randomUUID()
  db.prepare('INSERT INTO sprints (id, name, start_date, end_date, product_ids, status, effort_unit) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, startDate ?? null, endDate ?? null, JSON.stringify(productIds), status, effortUnit)
  res.status(201).json(deserialize(db.prepare('SELECT * FROM sprints WHERE id = ?').get(id) as Record<string, unknown>))
})

sprintsRouter.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM sprints WHERE id = ?').get(req.params.id)
  if (!row) { res.status(404).json({ error: 'Not found' }); return }
  const { name, startDate, endDate, productIds, status, effortUnit } = req.body as Record<string, unknown>
  const sets: string[] = []
  const vals: unknown[] = []
  if (name) { sets.push('name = ?'); vals.push(name) }
  if (startDate !== undefined) { sets.push('start_date = ?'); vals.push(startDate) }
  if (endDate !== undefined) { sets.push('end_date = ?'); vals.push(endDate) }
  if (productIds) { sets.push('product_ids = ?'); vals.push(JSON.stringify(productIds)) }
  if (status) { sets.push('status = ?'); vals.push(status) }
  if (effortUnit) { sets.push('effort_unit = ?'); vals.push(effortUnit) }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return }
  vals.push(req.params.id)
  db.prepare(`UPDATE sprints SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

  // When sprint is activated, snapshot committed story points per product
  if (status === 'active') {
    const sprint = db.prepare('SELECT product_ids FROM sprints WHERE id = ?').get(req.params.id) as { product_ids: string }
    const productIds = JSON.parse(sprint.product_ids ?? '[]') as string[]
    const upsertMetric = db.prepare(`
      INSERT INTO sprint_product_metrics (id, sprint_id, product_id, committed_story_points)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(sprint_id, product_id) DO UPDATE SET committed_story_points = excluded.committed_story_points
    `)
    db.transaction(() => {
      for (const pid of productIds) {
        const result = db.prepare(`
          SELECT COALESCE(SUM(effort_story_points), 0) as total
          FROM backlog_items WHERE sprint_id = ? AND product_id = ?
        `).get(req.params.id, pid) as { total: number }
        upsertMetric.run(randomUUID(), req.params.id, pid, result.total)
      }
    })()
  }

  res.json(deserialize(db.prepare('SELECT * FROM sprints WHERE id = ?').get(req.params.id) as Record<string, unknown>))
})

sprintsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM sprints WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

// --- Close sprint ---

function buildClosePreview(sprintId: string) {
  const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(sprintId) as Record<string, unknown> | undefined
  if (!sprint) return null

  const productIds = JSON.parse(sprint.product_ids as string ?? '[]') as string[]

  // Find next planned sprint per product
  const nextSprintByProduct: Record<string, { id: string; name: string } | null> = {}
  for (const pid of productIds) {
    const next = db.prepare(`
      SELECT id, name FROM sprints
      WHERE status = 'planned' AND id != ? AND product_ids LIKE ?
      ORDER BY start_date ASC, created_at ASC LIMIT 1
    `).get(sprintId, `%${pid}%`) as { id: string; name: string } | undefined
    nextSprintByProduct[pid] = next ?? null
  }

  const incompleteItems = db.prepare(`
    SELECT id, title, status, product_id FROM backlog_items
    WHERE sprint_id = ? AND status NOT IN ('done')
  `).all(sprintId) as Array<{ id: string; title: string; status: string; product_id: string | null }>

  const completedCount = (db.prepare(`SELECT COUNT(*) as cnt FROM backlog_items WHERE sprint_id = ? AND status = 'done'`).get(sprintId) as { cnt: number }).cnt

  return {
    sprint: deserialize(sprint),
    completedCount,
    incompleteItems: incompleteItems.map(item => {
      const next = item.product_id ? nextSprintByProduct[item.product_id] : null
      return {
        id: item.id,
        title: item.title,
        status: item.status,
        productId: item.product_id,
        destination: next ? { type: 'sprint', sprintId: next.id, sprintName: next.name } : { type: 'backlog' },
      }
    }),
  }
}

sprintsRouter.get('/:id/close-preview', (req, res) => {
  const preview = buildClosePreview(req.params.id)
  if (!preview) { res.status(404).json({ error: 'Not found' }); return }
  res.json(preview)
})

sprintsRouter.post('/:id/close', (req, res) => {
  const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!sprint) { res.status(404).json({ error: 'Not found' }); return }
  if (sprint.status === 'closed') { res.status(400).json({ error: 'Sprint already closed' }); return }

  const preview = buildClosePreview(req.params.id)!
  const closedAt = new Date().toISOString()

  db.transaction(() => {
    // Update sprint status
    db.prepare("UPDATE sprints SET status = 'closed', closed_at = ? WHERE id = ?").run(closedAt, req.params.id)

    // Update completed_story_points in sprint
    const completedSP = (db.prepare(`
      SELECT COALESCE(SUM(effort_story_points), 0) as total
      FROM backlog_items WHERE sprint_id = ? AND status = 'done'
    `).get(req.params.id) as { total: number }).total
    db.prepare('UPDATE sprints SET completed_story_points = ? WHERE id = ?').run(completedSP, req.params.id)

    // Update sprint_product_metrics completed SP
    const productIds = JSON.parse(sprint.product_ids as string ?? '[]') as string[]
    for (const pid of productIds) {
      const result = db.prepare(`
        SELECT COALESCE(SUM(effort_story_points), 0) as total
        FROM backlog_items WHERE sprint_id = ? AND product_id = ? AND status = 'done'
      `).get(req.params.id, pid) as { total: number }
      db.prepare(`
        INSERT INTO sprint_product_metrics (id, sprint_id, product_id, completed_story_points)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(sprint_id, product_id) DO UPDATE SET completed_story_points = excluded.completed_story_points
      `).run(randomUUID(), req.params.id, pid, result.total)
    }

    // Move incomplete items
    for (const item of preview.incompleteItems) {
      const oldSprintId = req.params.id
      const newSprintId = item.destination.type === 'sprint' ? item.destination.sprintId : null
      db.prepare('UPDATE backlog_items SET sprint_id = ?, updated_at = ? WHERE id = ?').run(newSprintId, closedAt, item.id)
      db.prepare(`
        INSERT INTO item_events (id, item_id, event_type, field, old_value, new_value, source)
        VALUES (?, ?, 'sprint_changed', 'sprintId', ?, ?, 'automation')
      `).run(randomUUID(), item.id, JSON.stringify(oldSprintId), JSON.stringify(newSprintId))
    }
  })()

  res.json(deserialize(db.prepare('SELECT * FROM sprints WHERE id = ?').get(req.params.id) as Record<string, unknown>))
})

sprintsRouter.get('/:id/burndown', (req, res) => {
  const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!sprint) { res.status(404).json({ error: 'Not found' }); return }

  const snapshots = db.prepare(
    'SELECT * FROM sprint_daily_snapshots WHERE sprint_id = ? ORDER BY snapshot_date'
  ).all(req.params.id) as Array<{
    snapshot_date: string
    remaining_story_points: number
    completed_story_points: number
    total_items: number
    status_counts: string
  }>

  const startDate = sprint.start_date as string | null
  const endDate = sprint.end_date as string | null
  const today = new Date().toISOString().slice(0, 10)

  // Total committed = first snapshot's remaining + completed, or sum of product metrics
  const firstSnap = snapshots[0]
  const total = firstSnap
    ? firstSnap.remaining_story_points + firstSnap.completed_story_points
    : 0

  const totalDays = startDate && endDate
    ? Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000))
    : 1

  const result = snapshots.map((s, i) => ({
    date: s.snapshot_date,
    remainingStoryPoints: s.remaining_story_points,
    completedStoryPoints: s.completed_story_points,
    statusCounts: JSON.parse(s.status_counts) as Record<string, number>,
    isToday: s.snapshot_date === today,
    ideal: total > 0 && startDate
      ? Math.max(0, Math.round(total * (1 - i / totalDays) * 10) / 10)
      : 0,
  }))

  res.json({
    sprintId: sprint.id,
    sprintName: sprint.name,
    startDate,
    endDate,
    totalCommittedPoints: total,
    snapshots: result,
  })
})

// --- Sprint capacity ---

sprintsRouter.get('/:id/capacity', (req, res) => {
  const rows = db.prepare(`
    SELECT sc.*, d.name as developer_name, d.capacity_per_sprint as default_sp
    FROM sprint_capacity sc
    JOIN developers d ON d.id = sc.developer_id
    WHERE sc.sprint_id = ?
  `).all(req.params.id) as Array<Record<string, unknown>>
  res.json(rows.map(r => ({
    id: r.id,
    sprintId: r.sprint_id,
    developerId: r.developer_id,
    developerName: r.developer_name,
    defaultSp: r.default_sp,
    capacityHours: r.capacity_hours,
    capacityStoryPoints: r.capacity_story_points,
    notes: r.notes,
    createdAt: r.created_at,
  })))
})

sprintsRouter.put('/:id/capacity/:devId', (req, res) => {
  const { capacityHours = 0, capacityStoryPoints, notes } = req.body as {
    capacityHours?: number; capacityStoryPoints?: number | null; notes?: string | null
  }
  const existing = db.prepare('SELECT id FROM sprint_capacity WHERE sprint_id = ? AND developer_id = ?').get(req.params.id, req.params.devId)
  if (existing) {
    db.prepare('UPDATE sprint_capacity SET capacity_hours = ?, capacity_story_points = ?, notes = ? WHERE sprint_id = ? AND developer_id = ?')
      .run(capacityHours, capacityStoryPoints ?? null, notes ?? null, req.params.id, req.params.devId)
  } else {
    db.prepare('INSERT INTO sprint_capacity (id, sprint_id, developer_id, capacity_hours, capacity_story_points, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), req.params.id, req.params.devId, capacityHours, capacityStoryPoints ?? null, notes ?? null)
  }
  const row = db.prepare(`
    SELECT sc.*, d.name as developer_name, d.capacity_per_sprint as default_sp
    FROM sprint_capacity sc JOIN developers d ON d.id = sc.developer_id
    WHERE sc.sprint_id = ? AND sc.developer_id = ?
  `).get(req.params.id, req.params.devId) as Record<string, unknown>
  res.json({
    id: row.id, sprintId: row.sprint_id, developerId: row.developer_id,
    developerName: row.developer_name, defaultSp: row.default_sp,
    capacityHours: row.capacity_hours, capacityStoryPoints: row.capacity_story_points,
    notes: row.notes, createdAt: row.created_at,
  })
})

// --- Sprint retrospective ---

sprintsRouter.get('/:id/retrospective', (req, res) => {
  const row = db.prepare('SELECT * FROM retrospectives WHERE sprint_id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!row) { res.json(null); return }
  res.json({
    id: row.id, sprintId: row.sprint_id,
    wentWell: row.went_well, toImprove: row.to_improve,
    actionItems: JSON.parse(row.action_items as string ?? '[]'),
    createdAt: row.created_at, updatedAt: row.updated_at,
  })
})

sprintsRouter.put('/:id/retrospective', (req, res) => {
  const { wentWell, toImprove, actionItems = [] } = req.body as {
    wentWell?: string | null; toImprove?: string | null; actionItems?: Array<{ text: string; owner?: string; done: boolean }>
  }
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT id FROM retrospectives WHERE sprint_id = ?').get(req.params.id)
  if (existing) {
    db.prepare('UPDATE retrospectives SET went_well = ?, to_improve = ?, action_items = ?, updated_at = ? WHERE sprint_id = ?')
      .run(wentWell ?? null, toImprove ?? null, JSON.stringify(actionItems), now, req.params.id)
  } else {
    db.prepare('INSERT INTO retrospectives (id, sprint_id, went_well, to_improve, action_items, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), req.params.id, wentWell ?? null, toImprove ?? null, JSON.stringify(actionItems), now, now)
  }
  const row = db.prepare('SELECT * FROM retrospectives WHERE sprint_id = ?').get(req.params.id) as Record<string, unknown>
  res.json({
    id: row.id, sprintId: row.sprint_id,
    wentWell: row.went_well, toImprove: row.to_improve,
    actionItems: JSON.parse(row.action_items as string ?? '[]'),
    createdAt: row.created_at, updatedAt: row.updated_at,
  })
})
