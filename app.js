const express = require('express');
const { createTaskRouter } = require('./routes/taskRoutes');
const { ValidationError, NotFoundError } = require('./services/taskService');

/**
 * Builds an Express app wired to the given db instance.
 * Kept as a factory (rather than a module-level app) so tests can create
 * an isolated app + in-memory db per test file.
 */
function createApp(db) {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/', createTaskRouter(db));

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Centralised error handler.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
