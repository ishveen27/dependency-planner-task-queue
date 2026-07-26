/**
 * Part A - Dependency Planner
 *
 * Given a list of tasks, each with a unique id and a depends_on list of
 * task ids, return one valid execution order in which every task appears
 * exactly once and every dependency is scheduled before the task that
 * needs it.
 *
 * Algorithm: Kahn's algorithm (BFS-based topological sort).
 *   1. Build an adjacency list (dependency -> dependents) and an
 *      in-degree count for every task (in-degree = number of unresolved
 *      dependencies).
 *   2. Push every task with in-degree 0 onto a queue.
 *   3. Repeatedly pop a task, append it to the result, and decrement the
 *      in-degree of everything that depends on it. Any task that drops
 *      to in-degree 0 is pushed onto the queue.
 *   4. If the result does not contain every task once the queue is
 *      empty, the remaining tasks form at least one cycle.
 *
 * Complexity (V = number of tasks, E = total number of dependency edges):
 *   Time:  O(V + E)  - each task and each edge is visited a constant
 *                      number of times (once to build the graph, once
 *                      when it is dequeued/processed).
 *   Space: O(V + E)  - adjacency list + in-degree map + queue + result,
 *                      all bounded by the number of tasks and edges.
 */

class MissingDependencyError extends Error {
  constructor(taskId, missingId) {
    super(`Task "${taskId}" depends on unknown task "${missingId}"`);
    this.name = 'MissingDependencyError';
    this.taskId = taskId;
    this.missingId = missingId;
  }
}

class CircularDependencyError extends Error {
  constructor(cycleTaskIds) {
    super(`Circular dependency detected among tasks: ${cycleTaskIds.join(', ')}`);
    this.name = 'CircularDependencyError';
    this.cycleTaskIds = cycleTaskIds;
  }
}

/**
 * @param {Array<{id: string, depends_on: string[]}>} tasks
 * @returns {string[]} a valid execution order (task ids)
 * @throws {MissingDependencyError} if a depends_on references an unknown id
 * @throws {CircularDependencyError} if the graph contains a cycle
 */
function planExecutionOrder(tasks) {
  if (!Array.isArray(tasks)) {
    throw new TypeError('tasks must be an array');
  }

  const ids = new Set(tasks.map((t) => t.id));

  // Validate all ids are unique (defensive; spec says ids are unique).
  if (ids.size !== tasks.length) {
    const seen = new Set();
    const duplicate = tasks.map((t) => t.id).find((id) => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    });
    throw new Error(`Duplicate task id found: "${duplicate}"`);
  }

  // adjacency: dependency -> [dependents]
  const adjacency = new Map(tasks.map((t) => [t.id, []]));
  const inDegree = new Map(tasks.map((t) => [t.id, 0]));

  for (const task of tasks) {
    for (const dep of task.depends_on || []) {
      if (!ids.has(dep)) {
        throw new MissingDependencyError(task.id, dep);
      }
      adjacency.get(dep).push(task.id);
      inDegree.set(task.id, inDegree.get(task.id) + 1);
    }
  }

  // Queue of tasks with no unresolved dependencies. Using the original
  // task order as a tie-breaker keeps the output deterministic.
  const queue = tasks
    .map((t) => t.id)
    .filter((id) => inDegree.get(id) === 0);

  const order = [];

  while (queue.length > 0) {
    const current = queue.shift();
    order.push(current);

    for (const dependent of adjacency.get(current)) {
      const remaining = inDegree.get(dependent) - 1;
      inDegree.set(dependent, remaining);
      if (remaining === 0) {
        queue.push(dependent);
      }
    }
  }

  if (order.length !== tasks.length) {
    const cycleTaskIds = tasks
      .map((t) => t.id)
      .filter((id) => !order.includes(id));
    throw new CircularDependencyError(cycleTaskIds);
  }

  return order;
}

module.exports = { planExecutionOrder, MissingDependencyError, CircularDependencyError };
