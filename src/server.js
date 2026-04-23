const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { ValidationError, hashExpenseInput, normalizeExpenseInput } = require('./expense-service');

const STATIC_FILE_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

function createExpenseTrackerServer({ store, publicDir }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');

      if (request.method === 'GET' && url.pathname === '/expenses') {
        return handleListExpenses(response, store, url.searchParams);
      }

      if (request.method === 'POST' && url.pathname === '/expenses') {
        return handleCreateExpense(request, response, store);
      }

      if (request.method === 'GET') {
        return serveStaticAsset(response, publicDir, url.pathname);
      }

      throw new HttpError(404, 'Route not found.');
    } catch (error) {
      handleError(response, error);
    }
  });
}

async function handleCreateExpense(request, response, store) {
  const idempotencyKey = request.headers['idempotency-key'];

  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
    throw new HttpError(400, 'Idempotency-Key header is required.');
  }

  const body = await readJsonBody(request);
  const normalizedExpense = normalizeExpenseInput(body);
  const requestHash = hashExpenseInput(normalizedExpense);
  const result = store.createExpense(normalizedExpense, idempotencyKey.trim(), requestHash);

  if (result.conflict) {
    sendJson(response, 409, {
      error: result.message,
    });
    return;
  }

  sendJson(response, result.replayed ? 200 : 201, {
    expense: store.serializeExpense(result.expense),
    replayed: result.replayed,
  });
}

function handleListExpenses(response, store, searchParams) {
  const category = searchParams.get('category') || '';
  const sort = searchParams.get('sort') || '';

  if (sort && sort !== 'date_desc') {
    throw new HttpError(400, 'Only sort=date_desc is supported.');
  }

  const result = store.listExpenses({ category, sort });

  sendJson(response, 200, {
    available_categories: result.availableCategories,
    expenses: result.expenses,
    total_amount: result.totalAmount,
  });
}

async function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = '';

    request.setEncoding('utf8');

    request.on('data', (chunk) => {
      rawBody += chunk;

      if (rawBody.length > 1_000_000) {
        reject(new HttpError(413, 'Request body is too large.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!rawBody.trim()) {
        reject(new ValidationError('Request body is required.'));
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new HttpError(400, 'Request body must contain valid JSON.'));
      }
    });

    request.on('error', reject);
  });
}

function serveStaticAsset(response, publicDir, requestPath) {
  const safeRequestPath = requestPath === '/' ? '/index.html' : requestPath;
  const resolvedPublicDir = path.resolve(publicDir);
  const assetPath = path.resolve(resolvedPublicDir, `.${safeRequestPath}`);

  if (assetPath !== resolvedPublicDir && !assetPath.startsWith(`${resolvedPublicDir}${path.sep}`)) {
    throw new HttpError(403, 'Forbidden.');
  }

const path = require('path'); // Make sure you have this at the top of your file
 
// 1. If the path exists but it is a directory (like visiting the root "/"), 
// tell it to look for the index.html file inside that directory.
if (fs.existsSync(assetPath) && fs.statSync(assetPath).isDirectory()) {
  assetPath = path.join(assetPath, 'index.html');
}
 
// 2. Now, if the file STILL doesn't exist, throw the error.
if (!fs.existsSync(assetPath)) {
  throw new HttpError(404, 'File not found.');
}


  const extension = path.extname(assetPath);
  const contentType = STATIC_FILE_TYPES[extension] || 'application/octet-stream';

  response.writeHead(200, {
    'Content-Type': contentType,
  });
  response.end(fs.readFileSync(assetPath));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function handleError(response, error) {
  const statusCode = Number(error.statusCode) || 500;
  const message =
    statusCode >= 500 ? 'Unexpected server error.' : error.message || 'Request failed.';

  sendJson(response, statusCode, {
    error: message,
  });
}

module.exports = {
  createExpenseTrackerServer,
};
