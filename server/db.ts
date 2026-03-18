import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'planning.db')

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

// Explicit type annotation avoids "cannot be named" TS error on export
const db: InstanceType<typeof Database> = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function migrate() {
  db.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_backlog_items_product ON backlog_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_backlog_items_status ON backlog_items(status);
    CREATE INDEX IF NOT EXISTS idx_backlog_items_priority ON backlog_items(priority);
    CREATE INDEX IF NOT EXISTS idx_backlog_items_sprint ON backlog_items(sprint_id);
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
  `)
}

migrate()

export default db
