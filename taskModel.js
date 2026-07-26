/**
 * Data access layer. Contains only raw SQL / DB operations - no
 * validation and no business rules. Everything here takes a `db`
 * instance so it can be exercised against an in-memory database in tests.
 */

function insertTask(db, task) {
  const stmt = db.prepare(`
    INSERT INTO tasks (id, title, priority, status, due_date, estimated_hours, created_at)
    VALUES (@id, @title, @priority, @status, @due_date, @estimated_hours, @created_at)
  `);
  stmt.run(task);
  return getTaskById(db, task.id);
}

function getTaskById(db, id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) || null;
}

function listTasks(db, { status } = {}) {
  if (status) {
    return db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC').all(status);
  }
  return db.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all();
}

function updateTaskStatus(db, id, status) {
  const result = db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
  if (result.changes === 0) return null;
  return getTaskById(db, id);
}

function deleteTask(db, id) {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Returns the single pending task that should be worked on next, using a
 * deterministic ordering computed entirely inside SQL:
 *   1. priority: critical > high > medium > low
 *   2. due_date: tasks with an earlier due date go first; tasks with no
 *      due date are treated as lowest urgency and sort after any task
 *      that does have a due date
 *   3. created_at: older tasks (submitted first) win ties, so the queue
 *      behaves fairly (FIFO) once priority and due date are equal
 *
 * Because `status` is indexed and the ORDER BY expression is a small,
 * fixed computation per row, the database can satisfy this with a single
 * index scan over pending rows: O(log n + k) where k is the number of
 * pending tasks, rather than a full O(n) scan of the whole table.
 */
function getNextPendingTask(db) {
  return db
    .prepare(
      `
      SELECT *
      FROM tasks
      WHERE status = 'pending'
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END ASC,
        (due_date IS NULL) ASC,
        due_date ASC,
        created_at ASC
      LIMIT 1
      `
    )
    .get();
}

module.exports = {
  insertTask,
  getTaskById,
  listTasks,
  updateTaskStatus,
  deleteTask,
  getNextPendingTask,
};
