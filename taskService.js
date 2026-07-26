const { randomUUID } = require('crypto');
const taskModel = require('../models/taskModel');

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['pending', 'in_progress', 'completed'];

class ValidationError extends Error {
  constructor(errors) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.errors = errors; // array of strings
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

function isValidISODate(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function validateCreateTask(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    return ['Request body must be a JSON object'];
  }

  if (typeof input.title !== 'string' || input.title.trim().length === 0) {
    errors.push('title is required and must be a non-empty string');
  }

  if (!PRIORITIES.includes(input.priority)) {
    errors.push(`priority is required and must be one of: ${PRIORITIES.join(', ')}`);
  }

  if (input.status !== undefined && !STATUSES.includes(input.status)) {
    errors.push(`status must be one of: ${STATUSES.join(', ')}`);
  }

  if (input.due_date !== undefined && input.due_date !== null && !isValidISODate(input.due_date)) {
    errors.push('due_date must be a valid ISO 8601 date string');
  }

  if (
    input.estimated_hours !== undefined &&
    input.estimated_hours !== null &&
    (typeof input.estimated_hours !== 'number' ||
      Number.isNaN(input.estimated_hours) ||
      input.estimated_hours < 0)
  ) {
    errors.push('estimated_hours must be a non-negative number');
  }

  return errors;
}

function createTask(db, input) {
  const errors = validateCreateTask(input);
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const task = {
    id: randomUUID(),
    title: input.title.trim(),
    priority: input.priority,
    status: input.status || 'pending',
    due_date: input.due_date || null,
    estimated_hours: input.estimated_hours ?? null,
    created_at: new Date().toISOString(),
  };

  return taskModel.insertTask(db, task);
}

function listTasks(db, { status } = {}) {
  if (status !== undefined && !STATUSES.includes(status)) {
    throw new ValidationError([`status filter must be one of: ${STATUSES.join(', ')}`]);
  }
  return taskModel.listTasks(db, { status });
}

function updateTaskStatus(db, id, status) {
  if (!STATUSES.includes(status)) {
    throw new ValidationError([`status must be one of: ${STATUSES.join(', ')}`]);
  }

  const existing = taskModel.getTaskById(db, id);
  if (!existing) {
    throw new NotFoundError(`Task "${id}" not found`);
  }

  return taskModel.updateTaskStatus(db, id, status);
}

function deleteTask(db, id) {
  const existing = taskModel.getTaskById(db, id);
  if (!existing) {
    throw new NotFoundError(`Task "${id}" not found`);
  }
  taskModel.deleteTask(db, id);
}

function getNextTask(db) {
  const task = taskModel.getNextPendingTask(db);
  return task || null;
}

module.exports = {
  createTask,
  listTasks,
  updateTaskStatus,
  deleteTask,
  getNextTask,
  validateCreateTask,
  ValidationError,
  NotFoundError,
  PRIORITIES,
  STATUSES,
};
