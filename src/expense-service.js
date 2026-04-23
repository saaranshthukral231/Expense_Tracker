const crypto = require('node:crypto');

const { formatPaise, parseAmountToPaise } = require('./money');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

function normalizeExpenseInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const category = normalizeTextField(rawInput.category, 'Category', 50);
  const description = normalizeTextField(rawInput.description, 'Description', 200);
  const date = normalizeDate(rawInput.date);
  const amountPaise = normalizeAmount(rawInput.amount);

  return {
    amountPaise,
    category,
    date,
    description,
  };
}

function normalizeAmount(value) {
  try {
    return parseAmountToPaise(value);
  } catch (error) {
    throw new ValidationError(error.message);
  }
}

function normalizeTextField(value, fieldName, maxLength) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw new ValidationError(`${fieldName} is required.`);
  }

  if (normalized.length > maxLength) {
    throw new ValidationError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return normalized;
}

function normalizeDate(value) {
  const normalized = String(value ?? '').trim();

  if (!DATE_PATTERN.test(normalized)) {
    throw new ValidationError('Date must be in YYYY-MM-DD format.');
  }

  const [year, month, day] = normalized.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new ValidationError('Date must be a valid calendar date.');
  }

  return normalized;
}

function hashExpenseInput(expenseInput) {
  const canonicalInput = JSON.stringify({
    amount: formatPaise(expenseInput.amountPaise),
    category: expenseInput.category,
    date: expenseInput.date,
    description: expenseInput.description,
  });

  return crypto.createHash('sha256').update(canonicalInput).digest('hex');
}

module.exports = {
  ValidationError,
  hashExpenseInput,
  normalizeExpenseInput,
};
