const path = require('node:path');

const { ExpenseStore } = require('./src/expense-store');
const { createExpenseTrackerServer } = require('./src/server');

const port = Number(process.env.PORT || 3000);
const dataFilePath = path.join(__dirname, 'data', 'expenses.json');
const publicDir = path.join(__dirname, 'public');

const store = new ExpenseStore(dataFilePath);
const server = createExpenseTrackerServer({ store, publicDir });

server.listen(port, () => {
  console.log(`Expense Tracker running at http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
