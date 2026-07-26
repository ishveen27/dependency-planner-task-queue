const {
  planExecutionOrder,
  MissingDependencyError,
  CircularDependencyError,
} = require('./dependencyPlanner');

// Helper: verify that an order respects every dependency constraint.
function isValidOrder(tasks, order) {
  const position = new Map(order.map((id, idx) => [id, idx]));
  return tasks.every((task) =>
    (task.depends_on || []).every((dep) => position.get(dep) < position.get(task.id))
  );
}

describe('planExecutionOrder', () => {
  test('returns a valid order for the example dependency graph', () => {
    const tasks = [
      { id: 'design', depends_on: [] },
      { id: 'api', depends_on: ['design'] },
      { id: 'ui', depends_on: ['design'] },
      { id: 'release', depends_on: ['api', 'ui'] },
    ];

    const order = planExecutionOrder(tasks);

    expect(order).toHaveLength(4);
    expect(new Set(order)).toEqual(new Set(['design', 'api', 'ui', 'release']));
    expect(isValidOrder(tasks, order)).toBe(true);
    // release must always be last, design must always be first
    expect(order[0]).toBe('design');
    expect(order[order.length - 1]).toBe('release');
  });

  test('handles fully independent tasks (no dependencies at all)', () => {
    const tasks = [
      { id: 'a', depends_on: [] },
      { id: 'b', depends_on: [] },
      { id: 'c', depends_on: [] },
    ];

    const order = planExecutionOrder(tasks);

    expect(order).toHaveLength(3);
    expect(new Set(order)).toEqual(new Set(['a', 'b', 'c']));
    expect(isValidOrder(tasks, order)).toBe(true);
  });

  test('detects a direct circular dependency', () => {
    const tasks = [
      { id: 'a', depends_on: ['b'] },
      { id: 'b', depends_on: ['a'] },
    ];

    expect(() => planExecutionOrder(tasks)).toThrow(CircularDependencyError);
  });

  test('detects a longer circular dependency chain', () => {
    const tasks = [
      { id: 'a', depends_on: ['c'] },
      { id: 'b', depends_on: ['a'] },
      { id: 'c', depends_on: ['b'] },
      { id: 'd', depends_on: [] }, // unrelated task, should not hide the cycle
    ];

    let error;
    try {
      planExecutionOrder(tasks);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CircularDependencyError);
    expect(new Set(error.cycleTaskIds)).toEqual(new Set(['a', 'b', 'c']));
  });

  test('detects a reference to a missing task id', () => {
    const tasks = [
      { id: 'design', depends_on: [] },
      { id: 'api', depends_on: ['design', 'does-not-exist'] },
    ];

    expect(() => planExecutionOrder(tasks)).toThrow(MissingDependencyError);
    expect(() => planExecutionOrder(tasks)).toThrow(/does-not-exist/);
  });

  test('returns an empty order for an empty task list', () => {
    expect(planExecutionOrder([])).toEqual([]);
  });

  test('rejects duplicate task ids', () => {
    const tasks = [
      { id: 'a', depends_on: [] },
      { id: 'a', depends_on: [] },
    ];

    expect(() => planExecutionOrder(tasks)).toThrow(/Duplicate task id/);
  });
});
