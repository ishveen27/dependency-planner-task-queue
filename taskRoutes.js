const express = require('express');
const taskService = require('../services/taskService');

/**
 * Builds a router bound to a specific db instance. Keeping the db
 * injectable (rather than a module-level singleton) is what lets the
 * test suite spin up a fresh in-memory database per test file.
 */
function createTaskRouter(db) {
  const router = express.Router();

  // IMPORTANT: /tasks/next must be declared before /tasks/:id so that
  // "next" is not swallowed by the :id param route.
  router.get('/tasks/next', (req, res) => {
    const task = taskService.getNextTask(db);
    if (!task) {
      return res.status(404).json({ error: 'No pending tasks available' });
    }
    res.json(task);
  });

  router.post('/tasks', (req, res, next) => {
    try {
      const task = taskService.createTask(db, req.body);
      res.status(201).json(task);
    } catch (err) {
      next(err);
    }
  });

  router.get('/tasks', (req, res, next) => {
    try {
      const tasks = taskService.listTasks(db, { status: req.query.status });
      res.json(tasks);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/tasks/:id/status', (req, res, next) => {
    try {
      const task = taskService.updateTaskStatus(db, req.params.id, req.body.status);
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tasks/:id', (req, res, next) => {
    try {
      taskService.deleteTask(db, req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createTaskRouter };
