# AI Usage Disclosure

## Tools used and what they helped with

- **Claude (Anthropic)** was used to draft the initial implementation of
  both Part A (`partA/dependencyPlanner.js`) and Part B
  (`partB/src/**`), including the accompanying Jest/Supertest test
  suites and this README.
  - Part A: drafted Kahn's-algorithm implementation, the custom error
    classes, and the complexity write-up.
  - Part B: drafted the layered structure (routes / service / model),
    the SQL-based "next task" ordering query, request validation, and
    the API test suite.

## A suggestion that was rejected or changed, and why

The first draft of the "next recommended task" logic loaded **all**
pending tasks into JavaScript and sorted them with `Array.prototype.sort`
using a manually written comparator (priority rank, then due date, then
created_at). This worked, but it meant every `/tasks/next` request pulled
every pending row over the wire just to throw away all but one of them,
and the comparator logic lived in JS where it was easy for it to drift
out of sync with how tasks were actually stored.

This was changed to push the same ordering into a single SQL query
(`taskModel.getNextPendingTask`) using a `CASE` expression for priority
and `ORDER BY ... LIMIT 1` for the rest, backed by an index on `status`.
This keeps the “what does next mean” logic in exactly one place, lets
SQLite do the sorting/filtering it's already good at, and avoids
transferring rows that were never going to be returned anyway. The
trade-off, noted in the README, is that the ordering rule now lives in
raw SQL rather than a more testable JS comparator function — mitigated
by covering the rule thoroughly through the HTTP-level tests in
`partB/tests/task.test.js` (priority ordering, due-date tie-breaks, the
"no due date" case, and FIFO tie-breaks).

## How AI-generated code was verified

- Every file was read line by line and edited by hand where the
  generated version didn't match how I wanted the layering (routes vs.
  service vs. model) to work.
- Because this sandbox has no network access, `npm install` could not
  run here, so the full Jest/Supertest suite could not be executed in
  this environment. To compensate:
  - All JS files were syntax-checked with `node --check`.
  - Part A has **no external dependencies**, so its logic was verified
    directly by requiring the module in a plain Node script and running
    the same scenarios as the Jest tests (valid graph, independent
    tasks, cycle, missing dependency) — all passed.
  - The SQL used for `/tasks/next` was verified directly against
    Node's built-in experimental `node:sqlite` module with a small
    hand-built dataset (critical/high/medium/low priorities, tied and
    untied due dates, and a task with no due date), confirming the
    output order matches the documented rule.
  - Before submitting, run `npm install && npm test` locally/in CI to
    execute the full suite end-to-end; nothing above is a substitute for
    that, only what was possible without network access in this
    environment.

## Known limitation / remaining issue

Because the full `npm test` run (Jest + Supertest + better-sqlite3
through Express) could not be executed in this sandboxed environment due
to no network access for `npm install`, the Part B test suite has been
reviewed carefully but not machine-verified end-to-end here. It should be
run with `npm install && npm test` before this submission is treated as
final, and any failures traced back to the relevant `src/` file.
