import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'planning.db')

const dataDir = path.join(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const db: InstanceType<typeof Database> = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ---------------------------------------------------------------------------
// Migration runner
// Each migration is applied exactly once per DB instance.
// New releases append entries to MIGRATIONS — never edit existing ones.
// ---------------------------------------------------------------------------

interface Migration {
  version: number
  description: string
  up: (db: InstanceType<typeof Database>) => void
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'initial schema',
    up: (db) => db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#6366f1',
        board_columns TEXT NOT NULL DEFAULT '["not-started","in-progress","review","done"]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS developers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        capacity_per_sprint REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sprints (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        product_ids TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'planned',
        effort_unit TEXT NOT NULL DEFAULT 'story-points',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS milestones (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        target_date TEXT,
        product_ids TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'planned',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS backlog_items (
        id TEXT PRIMARY KEY,
        external_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        item_type TEXT NOT NULL DEFAULT 'task',
        product_id TEXT REFERENCES products(id),
        feature TEXT,
        status TEXT NOT NULL DEFAULT 'not-started',
        priority TEXT NOT NULL DEFAULT 'medium',
        assignee_ids TEXT NOT NULL DEFAULT '[]',
        sprint_id TEXT REFERENCES sprints(id),
        milestone_id TEXT REFERENCES milestones(id),
        categories TEXT NOT NULL DEFAULT '[]',
        service TEXT,
        version TEXT,
        client TEXT,
        start_date TEXT,
        due_date TEXT,
        report_date TEXT,
        effort_story_points REAL,
        effort_quoted_hours REAL,
        effort_estimated_hours REAL,
        effort_actual_hours REAL,
        notes TEXT,
        prod_changes TEXT,
        related_item_id TEXT,
        related_item_title TEXT,
        help_desk_id TEXT,
        help_desk_title TEXT,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        imported_at TEXT NOT NULL DEFAULT (datetime('now')),
        import_hash TEXT,
        manual_overrides TEXT NOT NULL DEFAULT '[]',
        raw_fields TEXT NOT NULL DEFAULT '{}'
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_backlog_items_external_id
        ON backlog_items(external_id) WHERE external_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_backlog_items_product   ON backlog_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_backlog_items_status    ON backlog_items(status);
      CREATE INDEX IF NOT EXISTS idx_backlog_items_priority  ON backlog_items(priority);
      CREATE INDEX IF NOT EXISTS idx_backlog_items_sprint    ON backlog_items(sprint_id);
      CREATE INDEX IF NOT EXISTS idx_backlog_items_milestone ON backlog_items(milestone_id);

      CREATE TABLE IF NOT EXISTS import_snapshots (
        id TEXT PRIMARY KEY,
        imported_at TEXT NOT NULL DEFAULT (datetime('now')),
        filename TEXT NOT NULL,
        total_rows INTEGER NOT NULL DEFAULT 0,
        created_count INTEGER NOT NULL DEFAULT 0,
        updated_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        errors TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS app_config (
        id TEXT PRIMARY KEY DEFAULT 'singleton',
        default_effort_unit TEXT NOT NULL DEFAULT 'story-points',
        csv_mapping_profiles TEXT NOT NULL DEFAULT '[]',
        import_hash_fields TEXT NOT NULL DEFAULT '["title","productName"]'
      );

      INSERT OR IGNORE INTO app_config (id) VALUES ('singleton');
    `),
  },
  {
    version: 2,
    description: 'add sort_order to backlog_items for drag-and-drop persistence',
    up: (db) => {
      db.exec(`ALTER TABLE backlog_items ADD COLUMN sort_order INTEGER`)
      db.exec(`UPDATE backlog_items SET sort_order = rowid WHERE sort_order IS NULL`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_backlog_items_sort_order ON backlog_items(sort_order)`)
    },
  },
  {
    version: 3,
    description: 'add item_events table for unified history',
    up: (db) => db.exec(`
      CREATE TABLE IF NOT EXISTS item_events (
        id         TEXT PRIMARY KEY,
        item_id    TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        field      TEXT,
        old_value  TEXT,
        new_value  TEXT,
        source     TEXT NOT NULL DEFAULT 'user',
        actor      TEXT,
        metadata   TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_item_events_item    ON item_events(item_id);
      CREATE INDEX IF NOT EXISTS idx_item_events_type    ON item_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_item_events_created ON item_events(created_at);
    `),
  },
  {
    version: 4,
    description: 'add sprint metrics columns and sprint_product_metrics table',
    up: (db) => {
      db.exec(`ALTER TABLE sprints ADD COLUMN closed_at TEXT`)
      db.exec(`ALTER TABLE sprints ADD COLUMN sprint_goal TEXT`)
      db.exec(`ALTER TABLE sprints ADD COLUMN committed_story_points REAL`)
      db.exec(`ALTER TABLE sprints ADD COLUMN completed_story_points REAL`)
      db.exec(`
        CREATE TABLE IF NOT EXISTS sprint_product_metrics (
          id                      TEXT PRIMARY KEY,
          sprint_id               TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
          product_id              TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          committed_story_points  REAL,
          completed_story_points  REAL,
          UNIQUE(sprint_id, product_id)
        );
        CREATE INDEX IF NOT EXISTS idx_sprint_product_metrics_sprint  ON sprint_product_metrics(sprint_id);
        CREATE INDEX IF NOT EXISTS idx_sprint_product_metrics_product ON sprint_product_metrics(product_id);
      `)
    },
  },
  {
    version: 5,
    description: 'add sprint_daily_snapshots table',
    up: (db) => db.exec(`
      CREATE TABLE IF NOT EXISTS sprint_daily_snapshots (
        id                        TEXT PRIMARY KEY,
        sprint_id                 TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
        snapshot_date             TEXT NOT NULL,
        remaining_story_points    REAL NOT NULL DEFAULT 0,
        remaining_estimated_hours REAL NOT NULL DEFAULT 0,
        completed_story_points    REAL NOT NULL DEFAULT 0,
        completed_items           INTEGER NOT NULL DEFAULT 0,
        total_items               INTEGER NOT NULL DEFAULT 0,
        status_counts             TEXT NOT NULL DEFAULT '{}',
        created_at                TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(sprint_id, snapshot_date)
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_sprint ON sprint_daily_snapshots(sprint_id);
      CREATE INDEX IF NOT EXISTS idx_snapshots_date   ON sprint_daily_snapshots(snapshot_date);
    `),
  },
]

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_versions').all() as { version: number }[]).map(r => r.version)
  )

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue
    db.transaction(() => {
      m.up(db)
      db.prepare('INSERT INTO schema_versions (version, description) VALUES (?, ?)').run(m.version, m.description)
    })()
    console.log(`[migrate] Applied v${m.version}: ${m.description}`)
  }
}

migrate()

export default db
