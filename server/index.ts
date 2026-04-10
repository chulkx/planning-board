import express from 'express'
import cors from 'cors'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import db from './db.js'
import { config } from './config.js'
import { backlogRouter } from './routes/backlog.js'
import { importsRouter } from './routes/imports.js'
import { productsRouter } from './routes/products.js'
import { developersRouter } from './routes/developers.js'
import { sprintsRouter } from './routes/sprints.js'
import { milestonesRouter } from './routes/milestones.js'
import { configRouter } from './routes/config.js'
import { reportsRouter } from './routes/reports.js'
import { savedViewsRouter } from './routes/savedViews.js'
import { runSnapshotJob } from './services/snapshotService.js'
import { authRouter } from './routes/auth.js'
import { authenticateToken } from './middleware/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = config.port

app.use(cors({ origin: config.corsOrigin, credentials: true }))
app.use(express.json({ limit: '10mb' }))

// Auth — pública (login no requiere token)
app.use('/api/v1/auth', authRouter)

// Datos — protegidos
app.use('/api/v1/backlog-items', authenticateToken, backlogRouter)
app.use('/api/v1/imports',       authenticateToken, importsRouter)
app.use('/api/v1/products',      authenticateToken, productsRouter)
app.use('/api/v1/developers',    authenticateToken, developersRouter)
app.use('/api/v1/sprints',       authenticateToken, sprintsRouter)
app.use('/api/v1/milestones',    authenticateToken, milestonesRouter)
app.use('/api/v1/config',        authenticateToken, configRouter)
app.use('/api/v1/reports',       authenticateToken, reportsRouter)
app.use('/api/v1/saved-views',   authenticateToken, savedViewsRouter)

app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'ok',
    env: config.nodeEnv,
    uptime: Math.round(process.uptime()),
  })
})

app.get('/api/v1/exports/json', (_req, res) => {
  const data = {
    exportedAt: new Date().toISOString(),
    products: db.prepare('SELECT * FROM products').all(),
    developers: db.prepare('SELECT * FROM developers').all(),
    sprints: db.prepare('SELECT * FROM sprints').all(),
    milestones: db.prepare('SELECT * FROM milestones').all(),
    backlogItems: db.prepare('SELECT * FROM backlog_items').all(),
    itemEvents: db.prepare('SELECT * FROM item_events').all(),
    sprintCapacity: db.prepare('SELECT * FROM sprint_capacity').all(),
    retrospectives: db.prepare('SELECT * FROM retrospectives').all(),
    savedViews: db.prepare('SELECT * FROM saved_views').all(),
    config: db.prepare('SELECT * FROM app_config WHERE id = ?').get('singleton'),
  }
  res.setHeader('Content-Disposition', `attachment; filename="planning-board-backup-${new Date().toISOString().slice(0, 10)}.json"`)
  res.json(data)
})

if (config.isProd) {
  const distPath = path.join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) { next(); return }
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

function getLanIp(): string | null {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return null
}

app.listen(PORT, config.host, () => {
  const lan = getLanIp()
  console.log(`[server] env        : ${config.nodeEnv}`)
  console.log(`[server] local      : http://localhost:${PORT}`)
  if (lan) console.log(`[server] red local  : http://${lan}:${PORT}`)
  console.log(`[server] db         : ${config.dbPath}`)
  try { runSnapshotJob() } catch (e) { console.error('[snapshot] startup job failed:', e) }
})

// Re-run daily at midnight
const now = new Date()
const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
setTimeout(() => {
  runSnapshotJob()
  setInterval(() => runSnapshotJob(), 24 * 60 * 60 * 1000)
}, msUntilMidnight)
