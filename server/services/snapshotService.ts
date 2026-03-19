import { randomUUID } from 'crypto'
import db from '../db.js'

function dateRange(startDate: string, endDateStr: string): string[] {
  const dates: string[] = []
  const cur = new Date(startDate)
  const end = new Date(endDateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const effectiveEnd = end < today ? end : today
  while (cur <= effectiveEnd) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function computeSnapshot(sprintId: string) {
  const items = db.prepare(
    'SELECT status, effort_story_points, effort_estimated_hours FROM backlog_items WHERE sprint_id = ?'
  ).all(sprintId) as Array<{ status: string; effort_story_points: number | null; effort_estimated_hours: number | null }>

  const statusCounts: Record<string, number> = {}
  let remainingSP = 0
  let remainingHours = 0
  let completedSP = 0
  let completedItems = 0

  for (const item of items) {
    statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1
    if (item.status === 'done' || item.status === 'cancelled') {
      completedSP += item.effort_story_points ?? 0
      completedItems++
    } else {
      remainingSP += item.effort_story_points ?? 0
      remainingHours += item.effort_estimated_hours ?? 0
    }
  }

  return { remainingSP, remainingHours, completedSP, completedItems, total: items.length, statusCounts }
}

export function runSnapshotJob() {
  const activeSprints = db.prepare(
    "SELECT id, start_date, end_date FROM sprints WHERE status = 'active'"
  ).all() as Array<{ id: string; start_date: string | null; end_date: string | null }>

  for (const sprint of activeSprints) {
    if (!sprint.start_date || !sprint.end_date) continue

    const allDates = dateRange(sprint.start_date, sprint.end_date)
    if (allDates.length === 0) continue

    const existingDates = new Set(
      (db.prepare('SELECT DISTINCT snapshot_date FROM sprint_daily_snapshots WHERE sprint_id = ?')
        .all(sprint.id) as { snapshot_date: string }[]).map(r => r.snapshot_date)
    )

    const missing = allDates.filter(d => !existingDates.has(d))
    if (missing.length === 0) continue

    const snap = computeSnapshot(sprint.id)
    const insert = db.prepare(`
      INSERT OR IGNORE INTO sprint_daily_snapshots
        (id, sprint_id, snapshot_date, remaining_story_points, remaining_estimated_hours,
         completed_story_points, completed_items, total_items, status_counts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    db.transaction(() => {
      for (const date of missing) {
        insert.run(
          randomUUID(), sprint.id, date,
          snap.remainingSP, snap.remainingHours,
          snap.completedSP, snap.completedItems, snap.total,
          JSON.stringify(snap.statusCounts),
        )
      }
    })()
  }
}
