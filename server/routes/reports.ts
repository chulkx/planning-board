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

// ─── R6 Analytics ────────────────────────────────────────────────────────────

// GET /api/v1/reports/cycle-time?productId&from&to
reportsRouter.get('/cycle-time', (req, res) => {
  const { productId, from, to } = req.query as Record<string, string | undefined>

  let query = `
    WITH started AS (
      SELECT item_id, MIN(created_at) AS started_at
      FROM item_events
      WHERE event_type = 'status_changed' AND new_value = 'in-progress'
      GROUP BY item_id
    ),
    finished AS (
      SELECT item_id, MIN(created_at) AS done_at
      FROM item_events
      WHERE event_type = 'status_changed' AND new_value = 'done'
      GROUP BY item_id
    )
    SELECT
      b.id, b.title, b.item_type, b.product_id, b.sprint_id,
      s.started_at, f.done_at,
      ROUND((JULIANDAY(f.done_at) - JULIANDAY(s.started_at)) * 24, 1) AS cycle_time_hours
    FROM backlog_items b
    JOIN started s ON s.item_id = b.id
    JOIN finished f ON f.item_id = b.id
    WHERE b.status = 'done' AND f.done_at > s.started_at
  `
  const params: unknown[] = []

  if (productId) { query += ' AND b.product_id = ?'; params.push(productId) }
  if (from)      { query += ' AND f.done_at >= ?';   params.push(from) }
  if (to)        { query += ' AND f.done_at <= ?';   params.push(to) }
  query += ' ORDER BY f.done_at DESC LIMIT 200'

  const rows = db.prepare(query).all(...params) as Array<{
    id: string; title: string; item_type: string; product_id: string | null
    sprint_id: string | null; started_at: string; done_at: string; cycle_time_hours: number
  }>

  if (rows.length === 0) {
    res.json({ items: [], avg: null, p50: null, p90: null, buckets: [] })
    return
  }

  const hours = rows.map(r => r.cycle_time_hours).sort((a, b) => a - b)
  const avg = Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 10) / 10
  const p50 = hours[Math.floor(hours.length * 0.5)]
  const p90 = hours[Math.floor(hours.length * 0.9)]

  // Buckets for histogram
  const buckets = [
    { label: '< 1d',  min: 0,   max: 24,  count: 0 },
    { label: '1–3d',  min: 24,  max: 72,  count: 0 },
    { label: '3–7d',  min: 72,  max: 168, count: 0 },
    { label: '> 7d',  min: 168, max: Infinity, count: 0 },
  ]
  for (const h of hours) {
    const b = buckets.find(b => h >= b.min && h < b.max)
    if (b) b.count++
  }

  res.json({
    items: rows.map(r => ({
      id: r.id, title: r.title, itemType: r.item_type,
      productId: r.product_id, sprintId: r.sprint_id,
      startedAt: r.started_at, doneAt: r.done_at,
      cycleTimeHours: r.cycle_time_hours,
    })),
    avg, p50, p90,
    buckets: buckets.map(({ label, count }) => ({ label, count })),
  })
})

// GET /api/v1/reports/throughput?productId&limit
reportsRouter.get('/throughput', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? '10', 10) || 10, 20)
  const productId = req.query.productId as string | undefined

  let sprintIds: string[] | null = null
  if (productId) {
    const all = db.prepare('SELECT id, product_ids FROM sprints').all() as Array<{ id: string; product_ids: string }>
    sprintIds = all
      .filter(s => { try { return (JSON.parse(s.product_ids) as string[]).includes(productId) } catch { return false } })
      .map(s => s.id)
    if (sprintIds.length === 0) {
      res.json({ sprints: [] }); return
    }
  }

  const placeholders = sprintIds ? sprintIds.map(() => '?').join(',') : null
  const query = `
    SELECT
      s.id, s.name, s.closed_at, s.start_date, s.end_date,
      COUNT(b.id) AS total_items,
      SUM(CASE WHEN b.status = 'done' THEN 1 ELSE 0 END) AS completed_items,
      COALESCE(SUM(CASE WHEN b.status = 'done' THEN b.effort_story_points ELSE 0 END), 0) AS completed_sp,
      COALESCE(SUM(CASE WHEN b.status = 'bug' THEN 1 ELSE 0 END), 0) AS bug_count
    FROM sprints s
    LEFT JOIN backlog_items b ON b.sprint_id = s.id
    WHERE s.status IN ('closed', 'completed')
      ${placeholders ? `AND s.id IN (${placeholders})` : ''}
    GROUP BY s.id
    ORDER BY s.closed_at DESC
    LIMIT ?
  `
  const params: unknown[] = [...(sprintIds ?? []), limit]
  const rows = db.prepare(query).all(...params) as Array<{
    id: string; name: string; closed_at: string | null; start_date: string | null; end_date: string | null
    total_items: number; completed_items: number; completed_sp: number; bug_count: number
  }>

  res.json({
    sprints: rows.map(r => ({
      id: r.id, name: r.name, closedAt: r.closed_at,
      totalItems: r.total_items, completedItems: r.completed_items,
      completedSp: r.completed_sp, bugCount: r.bug_count,
      completionRate: r.total_items > 0 ? Math.round((r.completed_items / r.total_items) * 100) : 0,
    })),
  })
})

// GET /api/v1/reports/wip-aging
reportsRouter.get('/wip-aging', (req, res) => {
  const rows = db.prepare(`
    SELECT
      b.id, b.title, b.status, b.priority, b.product_id, b.sprint_id,
      b.assignee_ids,
      e.created_at AS status_since,
      ROUND((JULIANDAY('now') - JULIANDAY(e.created_at)) * 24, 1) AS hours_in_status
    FROM backlog_items b
    LEFT JOIN item_events e ON e.id = (
      SELECT id FROM item_events
      WHERE item_id = b.id AND event_type = 'status_changed'
      ORDER BY created_at DESC LIMIT 1
    )
    WHERE b.status IN ('in-progress', 'review', 'blocked')
    ORDER BY hours_in_status DESC
  `).all() as Array<{
    id: string; title: string; status: string; priority: string
    product_id: string | null; sprint_id: string | null; assignee_ids: string
    status_since: string | null; hours_in_status: number | null
  }>

  res.json({
    items: rows.map(r => ({
      id: r.id, title: r.title, status: r.status, priority: r.priority,
      productId: r.product_id, sprintId: r.sprint_id,
      assigneeIds: JSON.parse(r.assignee_ids ?? '[]'),
      statusSince: r.status_since, hoursInStatus: r.hours_in_status ?? 0,
    })),
  })
})

// GET /api/v1/reports/team-load?sprintId
reportsRouter.get('/team-load', (req, res) => {
  const { sprintId } = req.query as { sprintId?: string }

  // If no sprintId, find the active sprint
  const effectiveSprintId = sprintId ?? (
    db.prepare(`SELECT id FROM sprints WHERE status = 'active' ORDER BY start_date DESC LIMIT 1`).get() as { id: string } | undefined
  )?.id

  if (!effectiveSprintId) {
    res.json({ sprintId: null, developers: [] }); return
  }

  const developers = db.prepare(`
    SELECT
      d.id, d.name, d.capacity_per_sprint,
      COALESCE(sc.capacity_hours, d.capacity_per_sprint * 8) AS capacity_hours,
      sc.capacity_story_points
    FROM developers d
    LEFT JOIN sprint_capacity sc ON sc.developer_id = d.id AND sc.sprint_id = ?
    ORDER BY d.name
  `).all(effectiveSprintId) as Array<{
    id: string; name: string; capacity_per_sprint: number
    capacity_hours: number; capacity_story_points: number | null
  }>

  const items = db.prepare(`
    SELECT id, title, effort_story_points, effort_estimated_hours, assignee_ids, status
    FROM backlog_items
    WHERE sprint_id = ?
  `).all(effectiveSprintId) as Array<{
    id: string; title: string; effort_story_points: number | null
    effort_estimated_hours: number | null; assignee_ids: string; status: string
  }>

  const devLoad = developers.map(dev => {
    const assigned = items.filter(item => {
      try { return (JSON.parse(item.assignee_ids) as string[]).includes(dev.name) } catch { return false }
    })
    const assignedSp    = assigned.reduce((s, i) => s + (i.effort_story_points ?? 0), 0)
    const assignedHours = assigned.reduce((s, i) => s + (i.effort_estimated_hours ?? 0), 0)
    const completedItems = assigned.filter(i => i.status === 'done').length

    return {
      id: dev.id, name: dev.name,
      capacityHours: dev.capacity_hours,
      capacityStoryPoints: dev.capacity_story_points,
      assignedItems: assigned.length, completedItems,
      assignedSp: Math.round(assignedSp * 10) / 10,
      assignedHours: Math.round(assignedHours * 10) / 10,
      loadPct: dev.capacity_hours > 0
        ? Math.round((assignedHours / dev.capacity_hours) * 100)
        : null,
    }
  })

  res.json({ sprintId: effectiveSprintId, developers: devLoad })
})

// GET /api/v1/reports/estimation-accuracy?productId&limit
reportsRouter.get('/estimation-accuracy', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? '10', 10) || 10, 20)
  const productId = req.query.productId as string | undefined

  let sprintIds: string[] | null = null
  if (productId) {
    const all = db.prepare('SELECT id, product_ids FROM sprints').all() as Array<{ id: string; product_ids: string }>
    sprintIds = all
      .filter(s => { try { return (JSON.parse(s.product_ids) as string[]).includes(productId) } catch { return false } })
      .map(s => s.id)
    if (sprintIds.length === 0) {
      res.json({ sprints: [], avgAccuracy: null }); return
    }
  }

  const placeholders = sprintIds ? sprintIds.map(() => '?').join(',') : null
  const query = `
    SELECT
      s.id, s.name, s.closed_at,
      s.committed_story_points, s.completed_story_points,
      COUNT(b.id) AS items_without_sp
    FROM sprints s
    LEFT JOIN backlog_items b ON b.sprint_id = s.id AND b.effort_story_points IS NULL
    WHERE s.status IN ('closed', 'completed')
      ${placeholders ? `AND s.id IN (${placeholders})` : ''}
    GROUP BY s.id
    ORDER BY s.closed_at DESC
    LIMIT ?
  `
  const params: unknown[] = [...(sprintIds ?? []), limit]
  const rows = db.prepare(query).all(...params) as Array<{
    id: string; name: string; closed_at: string | null
    committed_story_points: number | null; completed_story_points: number | null
    items_without_sp: number
  }>

  const sprints = rows.map(r => ({
    id: r.id, name: r.name, closedAt: r.closed_at,
    committedSp: r.committed_story_points,
    completedSp: r.completed_story_points,
    accuracyPct: (r.committed_story_points && r.committed_story_points > 0)
      ? Math.round(((r.completed_story_points ?? 0) / r.committed_story_points) * 100)
      : null,
    itemsWithoutSp: r.items_without_sp,
  }))

  const withAccuracy = sprints.filter(s => s.accuracyPct !== null)
  const avgAccuracy = withAccuracy.length > 0
    ? Math.round(withAccuracy.reduce((s, r) => s + r.accuracyPct!, 0) / withAccuracy.length)
    : null

  res.json({ sprints, avgAccuracy })
})
