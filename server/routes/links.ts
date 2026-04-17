import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

export const linksRouter = Router({ mergeParams: true })

// GET /api/v1/backlog-items/:itemId/links
linksRouter.get('/', (req, res) => {
  const { itemId } = req.params

  const asSource = db.prepare(`
    SELECT il.id, il.link_type, il.created_at,
           b.id AS target_id, b.title AS target_title, b.status AS target_status,
           b.product_id AS target_product_id, 'source' AS role
    FROM item_links il
    JOIN backlog_items b ON b.id = il.target_id
    WHERE il.source_id = ?
  `).all(itemId) as Array<{
    id: string; link_type: string; created_at: string
    target_id: string; target_title: string; target_status: string
    target_product_id: string | null; role: string
  }>

  const asTarget = db.prepare(`
    SELECT il.id, il.link_type, il.created_at,
           b.id AS source_id, b.title AS source_title, b.status AS source_status,
           b.product_id AS source_product_id, 'target' AS role
    FROM item_links il
    JOIN backlog_items b ON b.id = il.source_id
    WHERE il.target_id = ?
  `).all(itemId) as Array<{
    id: string; link_type: string; created_at: string
    source_id: string; source_title: string; source_status: string
    source_product_id: string | null; role: string
  }>

  const blocks = asSource
    .filter(r => r.link_type === 'blocks')
    .map(r => ({ id: r.id, relatedItemId: r.target_id, relatedItemTitle: r.target_title, relatedItemStatus: r.target_status, relatedProductId: r.target_product_id, direction: 'outgoing', linkType: r.link_type, createdAt: r.created_at }))

  const blockedBy = asTarget
    .filter(r => r.link_type === 'blocks')
    .map(r => ({ id: r.id, relatedItemId: r.source_id, relatedItemTitle: r.source_title, relatedItemStatus: r.source_status, relatedProductId: r.source_product_id, direction: 'incoming', linkType: r.link_type, createdAt: r.created_at }))

  const related = [
    ...asSource.filter(r => r.link_type === 'related').map(r => ({ id: r.id, relatedItemId: r.target_id, relatedItemTitle: r.target_title, relatedItemStatus: r.target_status, relatedProductId: r.target_product_id, direction: 'outgoing', linkType: r.link_type, createdAt: r.created_at })),
    ...asTarget.filter(r => r.link_type === 'related').map(r => ({ id: r.id, relatedItemId: r.source_id, relatedItemTitle: r.source_title, relatedItemStatus: r.source_status, relatedProductId: r.source_product_id, direction: 'incoming', linkType: r.link_type, createdAt: r.created_at })),
  ]

  res.json({ blocks, blockedBy, related })
})

// POST /api/v1/backlog-items/:itemId/links
linksRouter.post('/', (req, res) => {
  const { itemId } = req.params
  const { targetId, linkType = 'blocks' } = req.body as { targetId: string; linkType?: string }

  if (!targetId) { res.status(400).json({ error: 'targetId is required' }); return }
  if (targetId === itemId) { res.status(400).json({ error: 'Cannot link item to itself' }); return }
  if (!['blocks', 'related'].includes(linkType)) { res.status(400).json({ error: 'linkType must be blocks or related' }); return }

  const targetExists = db.prepare('SELECT id FROM backlog_items WHERE id = ?').get(targetId)
  if (!targetExists) { res.status(404).json({ error: 'Target item not found' }); return }

  const id = randomUUID()
  try {
    db.prepare('INSERT INTO item_links (id, source_id, target_id, link_type) VALUES (?, ?, ?, ?)')
      .run(id, itemId, targetId, linkType)

    const actor = (req as unknown as { user?: { name?: string } }).user?.name ?? 'system'
    db.prepare(`INSERT INTO item_events (id, item_id, event_type, source, actor, metadata, created_at)
                VALUES (?, ?, 'link_added', 'user', ?, ?, datetime('now'))`)
      .run(randomUUID(), itemId, actor, JSON.stringify({ linkType, targetId }))
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Link already exists' }); return
    }
    throw e
  }

  res.status(201).json({ id, sourceId: itemId, targetId, linkType, createdAt: new Date().toISOString() })
})

// DELETE /api/v1/backlog-items/:itemId/links/:linkId
linksRouter.delete('/:linkId', (req, res) => {
  const { itemId, linkId } = req.params
  const link = db.prepare('SELECT * FROM item_links WHERE id = ? AND (source_id = ? OR target_id = ?)').get(linkId, itemId, itemId)
  if (!link) { res.status(404).json({ error: 'Link not found' }); return }

  db.prepare('DELETE FROM item_links WHERE id = ?').run(linkId)

  const actor = (req as unknown as { user?: { name?: string } }).user?.name ?? 'system'
  db.prepare(`INSERT INTO item_events (id, item_id, event_type, source, actor, metadata, created_at)
              VALUES (?, ?, 'link_removed', 'user', ?, ?, datetime('now'))`)
    .run(randomUUID(), itemId, actor, JSON.stringify({ linkId }))

  res.status(204).end()
})
