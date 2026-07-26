const Database = require('better-sqlite3');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    priority        TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status          TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')),
    due_date        TEXT,
    estimated_hours REAL,
    created_at      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
`;

/**
 * Creates (or opens) a SQLite database and ensures the schema exists.
 * @param {string} filename - path to the sqlite file, or ':memory:' for tests.
 * @returns {Database}
 */
function createDb(filename = 'tasks.db') {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

module.exports = { createDb };
