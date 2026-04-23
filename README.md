# Expense Tracker

A minimal full-stack expense tracker built with a small Node.js server and a plain JavaScript frontend.

## What it does

- Create an expense with `amount`, `category`, `description`, and `date`
- List expenses
- Filter expenses by category
- Sort expenses by date, newest first
- Show the total for the currently visible list
- Safely handle duplicate submits, refresh-after-submit, and client retries

## Run locally

Requirements:

- Node.js 18+

Start the app:

```bash
node server.js
```

Open [http://localhost:3000](http://localhost:3000).

Run tests:

```bash
node --test
```

## API

### `POST /expenses`

Create a new expense.

Headers:

- `Idempotency-Key: <unique-client-generated-value>` required

Body:

```json
{
  "amount": "499.99",
  "category": "Groceries",
  "description": "Weekend market run",
  "date": "2026-04-23"
}
```

Notes:

- Amounts are accepted as decimal strings and stored internally as integer paise to avoid floating-point errors.
- Repeating the same request with the same `Idempotency-Key` returns the original expense instead of creating a duplicate.
- Reusing an `Idempotency-Key` with different payload data returns `409 Conflict`.

### `GET /expenses`

Returns the current list of expenses.

Optional query params:

- `category=<name>`
- `sort=date_desc`

Example response:

```json
{
  "available_categories": ["Food", "Travel"],
  "expenses": [
    {
      "id": "f67bb0d4-a257-42ef-a7ec-62dd528a8220",
      "amount": "499.99",
      "category": "Groceries",
      "description": "Weekend market run",
      "date": "2026-04-23",
      "created_at": "2026-04-23T11:30:45.251Z"
    }
  ],
  "total_amount": "499.99"
}
```

## Design decisions

- Persistence: I used a JSON file (`data/expenses.json`) because it keeps setup friction near zero while still giving durable storage across restarts. The store writes both expenses and idempotency records to disk so a retry after a refresh or server restart still resolves correctly.
- Money handling: amounts are stored as integer paise, not floats. The API returns fixed 2-decimal strings.
- Retry safety: the backend requires an `Idempotency-Key` for `POST /expenses`. The frontend generates one per submission, stores the pending submission in `localStorage`, and retries with the same key if the browser refreshes or the request times out.
- UI behavior: the page shows loading, success, and recoverable error states, and it keeps a retry button visible whenever a submission is still pending.

## Trade-offs

- I chose a single-process file-backed store instead of SQLite or a server database to keep the app easy to run in a time-boxed exercise with no install step.
- The JSON store rewrites the full file on each successful create, which is fine for a small personal tool but not ideal for large datasets or multi-instance deployments.
- The API is intentionally narrow: only the required endpoints are implemented, with a small amount of validation rather than a broader auth or permissions model.

## Intentionally not done

- Authentication and multi-user support
- Edit/delete expenses
- Category summary charts or richer analytics
- Production deployment configuration for a specific host
