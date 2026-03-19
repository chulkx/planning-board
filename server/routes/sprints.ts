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
