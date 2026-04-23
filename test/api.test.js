const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ExpenseStore } = require('../src/expense-store');
const { createExpenseTrackerServer } = require('../src/server');

test('POST /expenses reuses the same expense when retried with the same idempotency key', async () => {
  const harness = await createHarness();

  try {
    const firstResponse = await harness.request('/expenses', {
      body: JSON.stringify({
        amount: '199.99',
        category: 'Food',
        date: '2026-04-20',
        description: 'Team lunch',
      }),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'expense-1',
      },
      method: 'POST',
    });

    const secondResponse = await harness.request('/expenses', {
      body: JSON.stringify({
        amount: '199.99',
        category: 'Food',
        date: '2026-04-20',
        description: 'Team lunch',
      }),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'expense-1',
      },
      method: 'POST',
    });

    const listResponse = await harness.request('/expenses?sort=date_desc');

    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 200);
    assert.equal(firstResponse.body.expense.id, secondResponse.body.expense.id);
    assert.equal(secondResponse.body.replayed, true);
    assert.equal(listResponse.body.expenses.length, 1);
    assert.equal(listResponse.body.total_amount, '199.99');
  } finally {
    await harness.close();
  }
});

test('GET /expenses filters by category and sorts newest date first', async () => {
  const harness = await createHarness();

  try {
    await createExpense(harness, 'expense-1', {
      amount: '20.00',
      category: 'Travel',
      date: '2026-04-18',
      description: 'Metro card recharge',
    });
    await createExpense(harness, 'expense-2', {
      amount: '40.00',
      category: 'Travel',
      date: '2026-04-22',
      description: 'Cab ride',
    });
    await createExpense(harness, 'expense-3', {
      amount: '15.50',
      category: 'Food',
      date: '2026-04-23',
      description: 'Breakfast',
    });

    const response = await harness.request('/expenses?category=Travel&sort=date_desc');

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.expenses.map((expense) => expense.description),
      ['Cab ride', 'Metro card recharge'],
    );
    assert.equal(response.body.total_amount, '60.00');
    assert.deepEqual(response.body.available_categories, ['Food', 'Travel']);
  } finally {
    await harness.close();
  }
});

async function createExpense(harness, key, expense) {
  const response = await harness.request('/expenses', {
    body: JSON.stringify(expense),
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    method: 'POST',
  });

  assert.equal(response.status, 201);
  return response.body;
}

async function createHarness() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-tracker-'));
  const publicDir = path.join(__dirname, '..', 'public');
  const store = new ExpenseStore(path.join(tempDir, 'expenses.json'));
  const server = createExpenseTrackerServer({ publicDir, store });

  await new Promise((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    async close() {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(tempDir, { force: true, recursive: true });
    },
    async request(targetPath, options = {}) {
      const response = await fetch(`${baseUrl}${targetPath}`, options);
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json') ? await response.json() : await response.text();

      return {
        body,
        status: response.status,
      };
    },
  };
}
