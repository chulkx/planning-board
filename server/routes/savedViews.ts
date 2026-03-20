import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

export const savedViewsRouter = Router()

savedViewsRouter.get('/', (req, res) => {
  const { screen } = req.query as { screen?: string }
  const rows = screen
    ? db.prepare('SELECT * FROM saved_views WHERE screen = ? ORDER BY created_at DESC').all(screen)
    : db.prepare('SELECT * FROM saved_views ORDER BY created_at DESC').all()
  res.json((rows as Record<string, unknown>[]).map(r => ({
    id: r.id, name: r.name, screen: r.screen,
    filters: JSON.parse(r.filters as string ?? '{}'),
    createdAt: r.created_at,
  })))
})

savedViewsRouter.post('/', (req, res) => {
  const { name, screen, filters = {} } = req.body as { name: string; screen: string; filters?: Record<string, unknown> }
  if (!name || !screen) { res.status(400).json({ error: 'name and screen are required' }); return }
  const id = randomUUID()
  db.prepare('INSERT INTO saved_views (id, name, screen, filters) VALUES (?, ?, ?, ?)')
    .run(id, name, screen, JSON.stringify(filters))
  const row = db.prepare('SELECT * FROM saved_views WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json({ id: row.id, name: row.name, screen: row.screen, filters: JSON.parse(row.filters as string), createdAt: row.created_at })
})

savedViewsRouter.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM saved_views WHERE id = ?').run(req.params.id)
  if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return }
  res.status(204).send()
})
