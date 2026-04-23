const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { HttpError, handleExpenseApiRequest } = require('./expense-api');

const STATIC_FILE_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function createExpenseTrackerServer({ store, publicDir }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');

      if (url.pathname === '/expenses') {
        return handleExpenseApiRequest(request, response, store);
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

function serveStaticAsset(response, publicDir, requestPath) {
  const safeRequestPath = requestPath === '/' ? '/index.html' : requestPath;
  const resolvedPublicDir = path.resolve(publicDir);
  const assetPath = path.resolve(resolvedPublicDir, `.${safeRequestPath}`);

  if (assetPath !== resolvedPublicDir && !assetPath.startsWith(`${resolvedPublicDir}${path.sep}`)) {
    throw new HttpError(403, 'Forbidden.');
  }

  if (!fs.existsSync(assetPath) || fs.statSync(assetPath).isDirectory()) {
    throw new HttpError(404, 'File not found.');
  }

  const extension = path.extname(assetPath);
  const contentType = STATIC_FILE_TYPES[extension] || 'application/octet-stream';

  response.writeHead(200, {
    'Content-Type': contentType,
  });
  response.end(fs.readFileSync(assetPath));
}

function handleError(response, error) {
  const statusCode = Number(error.statusCode) || 500;
  const message =
    statusCode >= 500 ? 'Unexpected server error.' : error.message || 'Request failed.';

  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify({ error: message }));
}

module.exports = {
  createExpenseTrackerServer,
};
