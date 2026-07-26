const { createDb } = require('./db');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || 'tasks.db';

const db = createDb(DB_FILE);
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`Smart Task Queue API listening on http://localhost:${PORT}`);
  console.log(`Using database file: ${DB_FILE}`);
});
