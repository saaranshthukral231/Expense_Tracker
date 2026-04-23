const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { formatPaise } = require('./money');

class ExpenseStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = this.loadState();
  }

  createExpense(expenseInput, idempotencyKey, requestHash) {
    const existingEntry = this.state.idempotencyKeys[idempotencyKey];

    if (existingEntry) {
      if (existingEntry.requestHash !== requestHash) {
        return {
          conflict: true,
          message: 'This Idempotency-Key has already been used for a different expense.',
        };
      }

      return {
        expense: this.findExpenseById(existingEntry.expenseId),
        replayed: true,
      };
    }

    const createdAt = new Date().toISOString();
    const expense = {
      id: crypto.randomUUID(),
      amountPaise: expenseInput.amountPaise,
      category: expenseInput.category,
      createdAt,
      date: expenseInput.date,
      description: expenseInput.description,
    };

    const nextState = {
      expenses: [...this.state.expenses, expense],
      idempotencyKeys: {
        ...this.state.idempotencyKeys,
        [idempotencyKey]: {
          createdAt,
          expenseId: expense.id,
          requestHash,
        },
      },
    };

    this.persistState(nextState);
    this.state = nextState;

    return {
      expense,
      replayed: false,
    };
  }

  listExpenses({ category, sort }) {
    const categoryFilter = typeof category === 'string' ? category.trim() : '';

    const filteredExpenses = this.state.expenses.filter((expense) => {
      if (!categoryFilter) {
        return true;
      }

      return expense.category === categoryFilter;
    });

    filteredExpenses.sort((left, right) => {
      if (sort === 'date_desc') {
        return (
          right.date.localeCompare(left.date) ||
          right.createdAt.localeCompare(left.createdAt) ||
          right.id.localeCompare(left.id)
        );
      }

      return (
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id)
      );
    });

    const totalPaise = filteredExpenses.reduce((sum, expense) => sum + expense.amountPaise, 0);

    return {
      availableCategories: this.listAvailableCategories(),
      expenses: filteredExpenses.map((expense) => this.serializeExpense(expense)),
      totalAmount: formatPaise(totalPaise),
    };
  }

  loadState() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      return createEmptyState();
    }

    const rawState = fs.readFileSync(this.filePath, 'utf8');

    if (!rawState.trim()) {
      return createEmptyState();
    }

    const parsed = JSON.parse(rawState);

    return {
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      idempotencyKeys:
        parsed.idempotencyKeys && typeof parsed.idempotencyKeys === 'object'
          ? parsed.idempotencyKeys
          : {},
    };
  }

  persistState(state) {
    const tempFilePath = `${this.filePath}.tmp`;
    const serialized = JSON.stringify(state, null, 2);

    fs.writeFileSync(tempFilePath, serialized, 'utf8');

    try {
      fs.renameSync(tempFilePath, this.filePath);
    } catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'EPERM') {
        throw error;
      }

      fs.rmSync(this.filePath, { force: true });
      fs.renameSync(tempFilePath, this.filePath);
    }
  }

  serializeExpense(expense) {
    return {
      amount: formatPaise(expense.amountPaise),
      category: expense.category,
      created_at: expense.createdAt,
      date: expense.date,
      description: expense.description,
      id: expense.id,
    };
  }

  findExpenseById(expenseId) {
    const expense = this.state.expenses.find((entry) => entry.id === expenseId);

    if (!expense) {
      throw new Error(`Could not find expense ${expenseId} for idempotent replay.`);
    }

    return expense;
  }

  listAvailableCategories() {
    return [...new Set(this.state.expenses.map((expense) => expense.category))].sort((left, right) =>
      left.localeCompare(right),
    );
  }
}

function createEmptyState() {
  return {
    expenses: [],
    idempotencyKeys: {},
  };
}

module.exports = {
  ExpenseStore,
};
