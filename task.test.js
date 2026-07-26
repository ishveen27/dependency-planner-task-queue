const request = require('supertest');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

function buildApp() {
  const db = createDb(':memory:');
  const app = createApp(db);
  return { app, db };
}

describe('Smart Task Queue API', () => {
  describe('POST /tasks', () => {
    test('creates a task with valid data', async () => {
      const { app } = buildApp();

      const res = await request(app).post('/tasks').send({
        title: 'Write README',
        priority: 'high',
        due_date: '2026-08-01T00:00:00.000Z',
        estimated_hours: 2,
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        title: 'Write README',
        priority: 'high',
        status: 'pending',
        estimated_hours: 2,
      });
      expect(res.body.id).toBeTruthy();
      expect(res.body.created_at).toBeTruthy();
    });

    test('rejects a task with a missing title', async () => {
      const { app } = buildApp();

      const res = await request(app).post('/tasks').send({ priority: 'low' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details.some((m) => m.includes('title'))).toBe(true);
    });

    test('rejects a task with an invalid priority', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Something', priority: 'urgent-ish' });

      expect(res.status).toBe(400);
      expect(res.body.details.some((m) => m.includes('priority'))).toBe(true);
    });

    test('rejects a negative estimated_hours', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Something', priority: 'low', estimated_hours: -3 });

      expect(res.status).toBe(400);
      expect(res.body.details.some((m) => m.includes('estimated_hours'))).toBe(true);
    });
  });

  describe('GET /tasks', () => {
    test('lists all tasks', async () => {
      const { app } = buildApp();
      await request(app).post('/tasks').send({ title: 'A', priority: 'low' });
      await request(app).post('/tasks').send({ title: 'B', priority: 'high' });

      const res = await request(app).get('/tasks');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    test('filters tasks by status', async () => {
      const { app } = buildApp();
      const created = await request(app).post('/tasks').send({ title: 'A', priority: 'low' });
      await request(app).post('/tasks').send({ title: 'B', priority: 'high' });
      await request(app)
        .patch(`/tasks/${created.body.id}/status`)
        .send({ status: 'completed' });

      const res = await request(app).get('/tasks?status=completed');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('A');
    });

    test('rejects an invalid status filter', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/tasks?status=not-a-status');
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    test('updates a task status', async () => {
      const { app } = buildApp();
      const created = await request(app).post('/tasks').send({ title: 'A', priority: 'low' });

      const res = await request(app)
        .patch(`/tasks/${created.body.id}/status`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('in_progress');
    });

    test('returns 404 for an unknown task id', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .patch('/tasks/does-not-exist/status')
        .send({ status: 'in_progress' });
      expect(res.status).toBe(404);
    });

    test('rejects an invalid status value', async () => {
      const { app } = buildApp();
      const created = await request(app).post('/tasks').send({ title: 'A', priority: 'low' });

      const res = await request(app)
        .patch(`/tasks/${created.body.id}/status`)
        .send({ status: 'archived' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /tasks/:id', () => {
    test('deletes an existing task', async () => {
      const { app } = buildApp();
      const created = await request(app).post('/tasks').send({ title: 'A', priority: 'low' });

      const res = await request(app).delete(`/tasks/${created.body.id}`);
      expect(res.status).toBe(204);

      const listRes = await request(app).get('/tasks');
      expect(listRes.body).toHaveLength(0);
    });

    test('returns 404 when deleting an unknown task', async () => {
      const { app } = buildApp();
      const res = await request(app).delete('/tasks/does-not-exist');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /tasks/next', () => {
    test('returns 404 when there are no pending tasks', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/tasks/next');
      expect(res.status).toBe(404);
    });

    test('prioritises critical over high, medium, and low', async () => {
      const { app } = buildApp();
      await request(app).post('/tasks').send({ title: 'Low', priority: 'low' });
      await request(app).post('/tasks').send({ title: 'Medium', priority: 'medium' });
      const critical = await request(app)
        .post('/tasks')
        .send({ title: 'Critical', priority: 'critical' });
      await request(app).post('/tasks').send({ title: 'High', priority: 'high' });

      const res = await request(app).get('/tasks/next');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(critical.body.id);
    });

    test('breaks priority ties using the earliest due date', async () => {
      const { app } = buildApp();
      await request(app)
        .post('/tasks')
        .send({ title: 'Due later', priority: 'high', due_date: '2026-12-01T00:00:00.000Z' });
      const dueSoon = await request(app)
        .post('/tasks')
        .send({ title: 'Due soon', priority: 'high', due_date: '2026-08-01T00:00:00.000Z' });

      const res = await request(app).get('/tasks/next');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(dueSoon.body.id);
    });

    test('treats tasks with a due date as more urgent than tasks without one', async () => {
      const { app } = buildApp();
      await request(app).post('/tasks').send({ title: 'No due date', priority: 'high' });
      const withDueDate = await request(app)
        .post('/tasks')
        .send({ title: 'Has due date', priority: 'high', due_date: '2027-01-01T00:00:00.000Z' });

      const res = await request(app).get('/tasks/next');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(withDueDate.body.id);
    });

    test('breaks remaining ties using creation order (FIFO)', async () => {
      const { app } = buildApp();
      const first = await request(app).post('/tasks').send({ title: 'First', priority: 'medium' });
      await request(app).post('/tasks').send({ title: 'Second', priority: 'medium' });

      const res = await request(app).get('/tasks/next');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(first.body.id);
    });

    test('ignores in_progress and completed tasks', async () => {
      const { app } = buildApp();
      const inProgress = await request(app)
        .post('/tasks')
        .send({ title: 'In progress', priority: 'critical' });
      await request(app)
        .patch(`/tasks/${inProgress.body.id}/status`)
        .send({ status: 'in_progress' });

      const pending = await request(app).post('/tasks').send({ title: 'Pending', priority: 'low' });

      const res = await request(app).get('/tasks/next');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(pending.body.id);
    });
  });
});
