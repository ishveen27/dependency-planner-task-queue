# Software Developer Technical Assessment

This repository contains both parts of the assessment:

- **Part A** — `partA/` — a dependency planner (topological sort).
- **Part B** — `partB/` — a Smart Task Queue REST API backed by SQLite.

Stack: **Node.js + Express + better-sqlite3 + Jest/Supertest**. Chosen because
it needs no external services, starts instantly, and lets one test runner
(Jest) cover both parts.

## Requirements

- Node.js 18+
- npm

## Setup

```bash
npm install
```

This installs dependencies for the whole repo (both Part A and Part B share
one `package.json`).

## Running the tests

```bash
npm test
```

This runs the full Jest suite: Part A's unit tests
(`partA/dependencyPlanner.test.js`) and Part B's API tests
(`partB/tests/task.test.js`, which use an in-memory SQLite database so the
suite has no side effects and needs no setup).

## Running the API (Part B)

```bash
npm start
```

Starts the server on `http://localhost:3000` (override with `PORT`) and
creates/opens a SQLite file `tasks.db` in the project root (override with
`DB_FILE`). Delete `tasks.db` to reset local data.

---

## Part A — Dependency Planner

**Location:** `partA/dependencyPlanner.js`

### Problem

Given a list of tasks, each with a unique `id` and a `depends_on` list of
task ids, return one valid execution order in which every task appears
exactly once and no task appears before a dependency it needs.

### Approach

Kahn's algorithm (BFS topological sort):

1. Build an adjacency list (`dependency -> [dependents]`) and an in-degree
   count per task (how many unresolved dependencies it has).
2. Seed a queue with every task that has in-degree 0 (no dependencies).
3. Repeatedly dequeue a task, append it to the result, and decrement the
   in-degree of everything that depends on it — pushing any task that
   reaches in-degree 0 onto the queue.
4. If the result doesn't contain every task once the queue empties, the
   leftover tasks form a cycle.

Errors:

- **`MissingDependencyError`** — thrown as soon as a `depends_on` entry
  references an id that isn't in the task list.
- **`CircularDependencyError`** — thrown after the BFS completes if some
  tasks were never dequeued; the error lists exactly which task ids are
  stuck in the cycle.

### Complexity

Let **V** = number of tasks, **E** = total number of dependency edges.

- **Time: O(V + E)** — building the adjacency list and in-degree map is a
  single pass over tasks and their dependency edges; the BFS then visits
  each task once and each edge once.
- **Space: O(V + E)** — the adjacency list and in-degree map are sized by
  the number of tasks and edges; the queue and result array are bounded
  by V.

### Tests

`partA/dependencyPlanner.test.js` covers:

- a valid multi-branch graph (the example from the brief),
- fully independent tasks (no edges at all),
- a direct 2-node cycle and a longer 3-node cycle mixed in with an
  unrelated task,
- a missing dependency reference,
- edge cases: empty input, duplicate ids.

---

## Part B — Smart Task Queue API

**Location:** `partB/`

### Structure

```
partB/
  src/
    db.js               # SQLite connection + schema (data access setup)
    models/
      taskModel.js       # Raw SQL only — no validation, no business rules
    services/
      taskService.js      # Validation + business rules, calls the model
    routes/
      taskRoutes.js       # Express routing only — calls the service
    app.js               # Express app factory + centralised error handling
    server.js             # Entry point: creates a real db file and starts listening
  tests/
    task.test.js          # Supertest API tests against an in-memory db
```

Routing, business logic, and data access are kept in separate files so
each can be tested/changed independently (e.g. you could swap
`taskModel.js` for a Postgres implementation without touching routes or
validation).

### Task model

| Field             | Type   | Notes                                              |
|-------------------|--------|-----------------------------------------------------|
| `id`              | string | UUID, generated server-side                        |
| `title`           | string | required                                            |
| `priority`        | enum   | `low` \| `medium` \| `high` \| `critical`, required |
| `status`          | enum   | `pending` \| `in_progress` \| `completed`, defaults to `pending` |
| `due_date`        | string | ISO 8601 date string, optional                      |
| `estimated_hours` | number | non-negative, optional                              |
| `created_at`      | string | ISO 8601 timestamp, generated server-side           |

### Endpoints

| Method | Path                | Description                                   |
|--------|---------------------|------------------------------------------------|
| POST   | `/tasks`            | Create a task                                  |
| GET    | `/tasks`            | List tasks (optionally `?status=pending`)      |
| PATCH  | `/tasks/:id/status` | Update a task's status                         |
| DELETE | `/tasks/:id`        | Delete a task                                  |
| GET    | `/tasks/next`       | Return the next recommended pending task       |
| GET    | `/health`           | Liveness check                                 |

All validation errors return `400` with `{ "error": "Validation failed", "details": [...] }`.
Unknown ids return `404` with `{ "error": "..." }`.

### Example requests

```bash
# Create a task
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Fix login bug","priority":"critical","due_date":"2026-08-01T00:00:00.000Z","estimated_hours":3}'

# List only pending tasks
curl http://localhost:3000/tasks?status=pending

# Update status
curl -X PATCH http://localhost:3000/tasks/<id>/status \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}'

# Get the next recommended task
curl http://localhost:3000/tasks/next

# Delete a task
curl -X DELETE http://localhost:3000/tasks/<id>
```

### "Next task" rule (deterministic)

`GET /tasks/next` returns the single `pending` task chosen by, in order:

1. **Priority** — `critical` > `high` > `medium` > `low`.
2. **Due date** — earlier due dates first. A task with **no** due date is
   treated as less urgent than any task that does have one, and sorts
   after all dated tasks.
3. **Created at** — if priority and due date both tie, the oldest task
   (first submitted) wins, so the queue behaves like a fair FIFO once the
   more important signals are equal.

This is implemented as a single SQL query (`taskModel.getNextPendingTask`)
using a `CASE` expression to rank priority and `ORDER BY` for the rest,
rather than pulling every task into memory and sorting in JavaScript.

**Data structure / complexity:** conceptually this is the "pick the
minimum by a composite key" problem, which a binary heap (priority queue)
solves in `O(log n)` per pop. We get the same effect for free from
SQLite: the `status` column is indexed (`idx_tasks_status` in `db.js`), so
the database can jump straight to `pending` rows via an index scan and
then only has to order that (usually much smaller) subset. Formally,
picking the single best row is `O(log n + k)` where `k` is the number of
pending tasks, versus `O(n)` if every row had to be scanned. If the
pending queue ever became large enough to matter, the same ordering could
be maintained incrementally in an in-memory binary heap for a true
`O(log n)` push/pop — the SQL approach was chosen here for simplicity and
because SQLite's query planner already does the useful part of that work.

### Validation

Handled in `src/services/taskService.js`:

- `title`: required, non-empty string.
- `priority`: required, must be one of the four enum values.
- `status` (on create): optional, must be a valid enum value if given.
- `due_date`: optional, must parse as a valid date if present.
- `estimated_hours`: optional, must be a non-negative number if present.

### Tests

`partB/tests/task.test.js` uses Supertest against an Express app wired to
an **in-memory** SQLite database (`:memory:`), so tests are hermetic, fast,
and never touch `tasks.db`. Coverage includes: creating valid/invalid
tasks, listing with and without a status filter, updating status
(including unknown ids and invalid status values), deleting (including
unknown ids), and `/tasks/next` — no pending tasks, priority ordering,
due-date tie-breaking, "no due date" ranking, FIFO tie-breaking, and
excluding non-pending tasks.

### Known limitations / trade-offs

- SQLite (via `better-sqlite3`) was chosen over Postgres/MongoDB for zero
  external setup. The data-access layer (`taskModel.js`) is isolated
  behind plain functions, so swapping the storage engine would only mean
  rewriting that one file.
- No authentication/authorization — out of scope for the brief, but would
  be the first thing added before any real deployment.
- No pagination on `GET /tasks` — acceptable at the assessment's scale;
  flagged as an optional enhancement in the brief.
- `due_date` and `estimated_hours` are stored loosely typed (TEXT / REAL)
  rather than with stricter DB-level constraints beyond the `CHECK`
  constraints already on `priority`/`status`, to keep the schema simple.
