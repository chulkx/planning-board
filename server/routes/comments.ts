import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

export const commentsRouter = Router({ mergeParams: true })

// GET /api/v1/backlog-items/:itemId/comments
commentsRouter.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM item_comments WHERE item_id = ? ORDER BY created_at ASC
  `).all(req.params.itemId) as Array<{
    id: string; item_id: string; author: string; body: string
    created_at: string; updated_at: string
  }>
  res.json(rows.map(r => ({
    id: r.id, itemId: r.item_id, author: r.author, body: r.body,
    createdAt: r.created_at, updatedAt: r.updated_at,
  })))
})

// POST /api/v1/backlog-items/:itemId/comments
commentsRouter.post('/', (req, res) => {
  const { author, body } = req.body as { author: string; body: string }
  if (!author || !body) { res.status(400).json({ error: 'author and body are required' }); return }

  const itemExists = db.prepare('SELECT id FROM backlog_items WHERE id = ?').get(req.params.itemId)
  if (!itemExists) { res.status(404).json({ error: 'Item not found' }); return }

  const id = randomUUID()
  db.prepare('INSERT INTO item_comments (id, item_id, author, body) VALUES (?, ?, ?, ?)')
    .run(id, req.params.itemId, author, body)

  db.prepare(`INSERT INTO item_events (id, item_id, event_type, source, actor, metadata, created_at)
              VALUES (?, ?, 'note_added', 'user', ?, ?, datetime('now'))`)
    .run(randomUUID(), req.params.itemId, author, JSON.stringify({ commentId: id }))

  const row = db.prepare('SELECT * FROM item_comments WHERE id = ?').get(id) as {
    id: string; item_id: string; author: string; body: string
    created_at: string; updated_at: string
  }
  res.status(201).json({ id: row.id, itemId: row.item_id, author: row.author, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at })
})

// PATCH /api/v1/backlog-items/:itemId/comments/:commentId
commentsRouter.patch('/:commentId', (req, res) => {
  const row = db.prepare('SELECT * FROM item_comments WHERE id = ? AND item_id = ?').get(req.params.commentId, req.params.itemId)
  if (!row) { res.status(404).json({ error: 'Comment not found' }); return }
  const { body } = req.body as { body: string }
  if (!body) { res.status(400).json({ error: 'body is required' }); return }
  db.prepare(`UPDATE item_comments SET body = ?, updated_at = datetime('now') WHERE id = ?`).run(body, req.params.commentId)
  const updated = db.prepare('SELECT * FROM item_comments WHERE id = ?').get(req.params.commentId) as {
    id: string; item_id: string; author: string; body: string
    created_at: string; updated_at: string
  }
  res.json({ id: updated.id, itemId: updated.item_id, author: updated.author, body: updated.body, createdAt: updated.created_at, updatedAt: updated.updated_at })
})

// DELETE /api/v1/backlog-items/:itemId/comments/:commentId
commentsRouter.delete('/:commentId', (req, res) => {
  db.prepare('DELETE FROM item_comments WHERE id = ? AND item_id = ?').run(req.params.commentId, req.params.itemId)
  res.status(204).end()
})
