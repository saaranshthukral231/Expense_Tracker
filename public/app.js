const PENDING_SUBMISSION_KEY = 'expense-tracker.pending-expense.v1';
const REQUEST_TIMEOUT_MS = 12_000;

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  style: 'currency',
});

const state = {
  categories: [],
  filterCategory: '',
  isLoadingExpenses: false,
  isSubmitting: false,
  sort: 'date_desc',
};

const elements = {
  amountInput: document.querySelector('#amountInput'),
  categoryFilter: document.querySelector('#categoryFilter'),
  categoryInput: document.querySelector('#categoryInput'),
  dateInput: document.querySelector('#dateInput'),
  descriptionInput: document.querySelector('#descriptionInput'),
  expenseForm: document.querySelector('#expenseForm'),
  expenseRows: document.querySelector('#expenseRows'),
  listState: document.querySelector('#listState'),
  retryButton: document.querySelector('#retryButton'),
  sortSelect: document.querySelector('#sortSelect'),
  statusBanner: document.querySelector('#statusBanner'),
  submitButton: document.querySelector('#submitButton'),
  totalAmount: document.querySelector('#totalAmount'),
};

window.addEventListener('DOMContentLoaded', () => {
  initializeApp().catch((error) => {
    showStatus(error.message || 'Could not start the app.', 'error');
  });
});

async function initializeApp() {
  elements.dateInput.value = formatDateForInput(new Date());
  bindEvents();
  await loadExpenses();

  const pendingSubmission = readPendingSubmission();

  if (pendingSubmission) {
    restoreFormFromPendingSubmission(pendingSubmission);
    showStatus('A previous save is still pending. Retrying it now.', 'warning');
    await sendExpense(pendingSubmission, { fromRecovery: true });
  }
}

function bindEvents() {
  elements.expenseForm.addEventListener('submit', handleExpenseSubmit);
  elements.retryButton.addEventListener('click', handleRetryClick);
  elements.categoryFilter.addEventListener('change', async (event) => {
    state.filterCategory = event.target.value;
    await loadExpenses();
  });
  elements.sortSelect.addEventListener('change', async (event) => {
    state.sort = event.target.value;
    await loadExpenses();
  });
}

async function handleExpenseSubmit(event) {
  event.preventDefault();

  if (state.isSubmitting) {
    return;
  }

  let payload;

  try {
    payload = readFormValues();
  } catch (error) {
    showStatus(error.message, 'error');
    return;
  }

  const pendingSubmission = {
    createdAt: new Date().toISOString(),
    idempotencyKey: crypto.randomUUID(),
    payload,
  };

  persistPendingSubmission(pendingSubmission);
  await sendExpense(pendingSubmission, { fromRecovery: false });
}

async function handleRetryClick() {
  const pendingSubmission = readPendingSubmission();

  if (!pendingSubmission) {
    showStatus('There is no pending save to retry.', 'info');
    renderSubmissionState();
    return;
  }

  restoreFormFromPendingSubmission(pendingSubmission);
  await sendExpense(pendingSubmission, { fromRecovery: true });
}

async function sendExpense(pendingSubmission, { fromRecovery }) {
  state.isSubmitting = true;
  renderSubmissionState();
  showStatus(
    fromRecovery ? 'Retrying the pending save...' : 'Saving expense...',
    'info',
  );

  try {
    const response = await fetchWithTimeout('/expenses', {
      body: JSON.stringify(pendingSubmission.payload),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': pendingSubmission.idempotencyKey,
      },
      method: 'POST',
    });

    const payload = await response.json();

    if (!response.ok) {
      if (response.status >= 500) {
        throw new Error(payload.error || 'The server could not save the expense right now.');
      }

      clearPendingSubmission();
      throw new Error(payload.error || 'The expense could not be saved.');
    }

    clearPendingSubmission();
    resetForm();
    await loadExpenses();
    showStatus(
      payload.replayed
        ? 'The previous submission was already saved, so the existing expense was reused.'
        : 'Expense saved.',
      'success',
    );
  } catch (error) {
    const message =
      error.name === 'AbortError'
        ? 'The save request took too long. Your expense is still pending and can be retried safely.'
        : error.message || 'The save request failed. Your expense is still pending.';

    showStatus(message, 'warning');
  } finally {
    state.isSubmitting = false;
    renderSubmissionState();
  }
}

async function loadExpenses() {
  state.isLoadingExpenses = true;
  renderListState('Loading expenses...');

  try {
    const searchParams = new URLSearchParams();

    if (state.filterCategory) {
      searchParams.set('category', state.filterCategory);
    }

    if (state.sort) {
      searchParams.set('sort', state.sort);
    }

    const path = searchParams.toString() ? `/expenses?${searchParams.toString()}` : '/expenses';
    const response = await fetchWithTimeout(path);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Could not load expenses.');
    }

    state.categories = payload.available_categories || [];
    renderCategoryFilter(state.categories);
    renderExpenses(payload.expenses || []);
    renderTotal(payload.total_amount || '0.00');

    if (!payload.expenses || payload.expenses.length === 0) {
      renderListState('No expenses match the current view.');
      return;
    }

    renderListState('');
  } catch (error) {
    renderExpenses([]);
    renderTotal('0.00');
    renderListState(error.message || 'Could not load expenses.');
  } finally {
    state.isLoadingExpenses = false;
  }
}

function readFormValues() {
  const payload = {
    amount: elements.amountInput.value.trim(),
    category: elements.categoryInput.value.trim(),
    date: elements.dateInput.value.trim(),
    description: elements.descriptionInput.value.trim(),
  };

  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(payload.amount) || Number(payload.amount) <= 0) {
    throw new Error('Enter an amount greater than zero using up to two decimals.');
  }

  if (!payload.category) {
    throw new Error('Category is required.');
  }

  if (!payload.description) {
    throw new Error('Description is required.');
  }

  if (!payload.date) {
    throw new Error('Date is required.');
  }

  return payload;
}

function resetForm() {
  elements.expenseForm.reset();
  elements.dateInput.value = formatDateForInput(new Date());
}

function renderExpenses(expenses) {
  elements.expenseRows.textContent = '';

  for (const expense of expenses) {
    const row = document.createElement('tr');
    row.appendChild(createCell(expense.date));
    row.appendChild(createCell(expense.category));
    row.appendChild(createCell(expense.description));
    row.appendChild(createCell(formatAmount(expense.amount), 'amount-column'));
    elements.expenseRows.appendChild(row);
  }
}

function renderCategoryFilter(categories) {
  const currentValue = state.filterCategory;
  const options = ['<option value="">All categories</option>'];

  for (const category of categories) {
    const isSelected = category === currentValue ? ' selected' : '';
    options.push(`<option value="${escapeHtml(category)}"${isSelected}>${escapeHtml(category)}</option>`);
  }

  elements.categoryFilter.innerHTML = options.join('');

  if (currentValue && !categories.includes(currentValue)) {
    state.filterCategory = '';
    elements.categoryFilter.value = '';
  }
}

function renderTotal(amount) {
  elements.totalAmount.textContent = formatAmount(amount);
}

function renderSubmissionState() {
  elements.submitButton.disabled = state.isSubmitting;

  if (readPendingSubmission()) {
    elements.retryButton.classList.remove('hidden');
  } else {
    elements.retryButton.classList.add('hidden');
  }
}

function renderListState(message) {
  elements.listState.textContent = message;
}

function showStatus(message, tone) {
  if (!message) {
    elements.statusBanner.className = 'status-banner hidden';
    elements.statusBanner.textContent = '';
    return;
  }

  elements.statusBanner.className = `status-banner ${tone}`;
  elements.statusBanner.textContent = message;
}

function createCell(text, className = '') {
  const cell = document.createElement('td');
  cell.textContent = text;

  if (className) {
    cell.className = className;
  }

  return cell;
}

function persistPendingSubmission(submission) {
  localStorage.setItem(PENDING_SUBMISSION_KEY, JSON.stringify(submission));
  renderSubmissionState();
}

function readPendingSubmission() {
  const rawValue = localStorage.getItem(PENDING_SUBMISSION_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    localStorage.removeItem(PENDING_SUBMISSION_KEY);
    return null;
  }
}

function clearPendingSubmission() {
  localStorage.removeItem(PENDING_SUBMISSION_KEY);
}

function restoreFormFromPendingSubmission(submission) {
  elements.amountInput.value = submission.payload.amount || '';
  elements.categoryInput.value = submission.payload.category || '';
  elements.descriptionInput.value = submission.payload.description || '';
  elements.dateInput.value = submission.payload.date || '';
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatAmount(amountString) {
  return currencyFormatter.format(Number(amountString));
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function fetchWithTimeout(resource, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}
