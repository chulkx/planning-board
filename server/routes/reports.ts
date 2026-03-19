import { Router } from 'express'
import db from '../db.js'

export const reportsRouter = Router()

// GET /api/v1/reports/velocity?limit=8&productId=optional
reportsRouter.get('/velocity', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? '8', 10) || 8, 20)
  const productId = req.query.productId as string | undefined

  if (productId) {
    // Per-product velocity from sprint_product_metrics
    const rows = db.prepare(`
      SELECT s.id, s.name, s.closed_at, spm.committed_story_points, spm.completed_story_points
      FROM sprint_product_metrics spm
      JOIN sprints s ON s.id = spm.sprint_id
      WHERE spm.product_id = ? AND s.status = 'completed' AND s.closed_at IS NOT NULL
      ORDER BY s.closed_at DESC
      LIMIT ?
    `).all(productId, limit) as Array<{
      id: string; name: string; closed_at: string
      committed_story_points: number | null; completed_story_points: number | null
    }>

    const sprints = rows.map(r => ({
      id: r.id,
      name: r.name,
      closedAt: r.closed_at,
      committedStoryPoints: r.committed_story_points ?? 0,
      completedStoryPoints: r.completed_story_points ?? 0,
      velocityRatio: r.committed_story_points
        ? (r.completed_story_points ?? 0) / r.committed_story_points
        : 0,
    }))

    const avg = sprints.length
      ? sprints.reduce((s, r) => s + r.completedStoryPoints, 0) / sprints.length
      : 0

    res.json({ sprints, averageVelocity: Math.round(avg * 10) / 10 })
  } else {
    // Team-wide velocity from sprints table
    const rows = db.prepare(`
      SELECT id, name, closed_at, committed_story_points, completed_story_points
      FROM sprints
      WHERE status = 'completed' AND closed_at IS NOT NULL
      ORDER BY closed_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: string; name: string; closed_at: string
      committed_story_points: number | null; completed_story_points: number | null
    }>

    const sprints = rows.map(r => ({
      id: r.id,
      name: r.name,
      closedAt: r.closed_at,
      committedStoryPoints: r.committed_story_points ?? 0,
      completedStoryPoints: r.completed_story_points ?? 0,
      velocityRatio: r.committed_story_points
        ? (r.completed_story_points ?? 0) / r.committed_story_points
        : 0,
    }))

    const avg = sprints.length
      ? sprints.reduce((s, r) => s + r.completedStoryPoints, 0) / sprints.length
      : 0

    res.json({ sprints, averageVelocity: Math.round(avg * 10) / 10 })
  }
})

// GET /api/v1/reports/products/:id/cfd?from=YYYY-MM-DD&to=YYYY-MM-DD
reportsRouter.get('/products/:id/cfd', (req, res) => {
  const { id } = req.params
  const { from, to } = req.query as { from?: string; to?: string }

  // Find sprints that include this product
  const allSprints = db.prepare('SELECT id, product_ids FROM sprints').all() as Array<{ id: string; product_ids: string }>
  const sprintIds = allSprints
    .filter(s => {
      try { return (JSON.parse(s.product_ids) as string[]).includes(id) } catch { return false }
    })
    .map(s => s.id)

  if (sprintIds.length === 0) {
    res.json({ dates: [], series: [] })
    return
  }

  const placeholders = sprintIds.map(() => '?').join(',')
  let query = `SELECT snapshot_date, status_counts FROM sprint_daily_snapshots WHERE sprint_id IN (${placeholders})`
  const params: unknown[] = [...sprintIds]

  if (from) { query += ' AND snapshot_date >= ?'; params.push(from) }
  if (to)   { query += ' AND snapshot_date <= ?'; params.push(to) }
  query += ' ORDER BY snapshot_date'

  const rows = db.prepare(query).all(...params) as Array<{ snapshot_date: string; status_counts: string }>

  // Aggregate by date (sum counts across sprints for that product)
  const byDate = new Map<string, Record<string, number>>()
  for (const row of rows) {
    const counts = JSON.parse(row.status_counts) as Record<string, number>
    const existing = byDate.get(row.snapshot_date) ?? {}
    for (const [status, count] of Object.entries(counts)) {
      existing[status] = (existing[status] ?? 0) + count
    }
    byDate.set(row.snapshot_date, existing)
  }

  const dates = [...byDate.keys()]
  const allStatuses = [...new Set(dates.flatMap(d => Object.keys(byDate.get(d)!)))]

  const series = allStatuses.map(status => ({
    status,
    counts: dates.map(d => byDate.get(d)![status] ?? 0),
  }))

  res.json({ dates, series })
})
