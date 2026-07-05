const cors = require('cors');
const express = require('express');

const app = express();

const port = Number(process.env.PORT || 8787);
const upstreamBaseUrl = (process.env.SUB2API_BASE_URL || '').trim().replace(/\/$/, '');
const adminApiKey = (process.env.SUB2API_ADMIN_API_KEY || '').trim();
const allowedOrigin = (process.env.ALLOW_ORIGIN || '*').trim();

function formatAuthorizationHeader(value) {
  return value.toLowerCase().startsWith('bearer ') ? value : `Bearer ${value}`;
}

function isSuccessPayload(json) {
  if (!json || typeof json !== 'object') {
    return true;
  }

  if (typeof json.code === 'number') {
    return json.code === 0 || (json.code >= 200 && json.code < 300);
  }

  if (typeof json.success === 'boolean') {
    return json.success;
  }

  return true;
}

async function fetchAdminJson(path) {
  if (!upstreamBaseUrl) {
    throw new Error('SUB2API_BASE_URL_NOT_CONFIGURED');
  }

  if (!adminApiKey) {
    throw new Error('SUB2API_ADMIN_API_KEY_NOT_CONFIGURED');
  }

  const response = await fetch(`${upstreamBaseUrl}${path}`, {
    headers: {
      'x-api-key': adminApiKey,
      Authorization: formatAuthorizationHeader(adminApiKey),
    },
  });

  const json = await response.json();

  if (!response.ok || !isSuccessPayload(json)) {
    throw new Error(json.message || 'ADMIN_FETCH_FAILED');
  }

  return json.data ?? json;
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }

  return undefined;
}

function getItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  for (const key of ['items', 'api_keys', 'apiKeys', 'keys', 'data']) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function attachApiKeyOwner(item, user) {
  return {
    ...item,
    user_id: toNumber(item.user_id) ?? toNumber(item.userId) ?? user.id,
    user_email: item.user_email ?? item.userEmail ?? user.email,
    user: {
      ...(item.user && typeof item.user === 'object' ? item.user : {}),
      id: user.id,
      email: user.email,
      username: user.username,
    },
  };
}

async function listAdminUsers() {
  const users = [];
  let currentPage = 1;
  let totalPages = 1;

  do {
    const userPage = await fetchAdminJson(`/api/v1/admin/users?page=${currentPage}&page_size=100`);
    users.push(...getItems(userPage));
    totalPages = userPage.pages || Math.ceil((userPage.total || users.length) / (userPage.page_size || 100)) || 1;
    currentPage += 1;
  } while (currentPage <= totalPages);

  return users;
}

async function listUserApiKeys(user) {
  const result = await fetchAdminJson(`/api/v1/admin/users/${user.id}/api-keys?page=1&page_size=100`);
  return getItems(result).map((item) => attachApiKeyOwner(item, user));
}

async function findApiKeyOwner(apiKeyId) {
  const users = await listAdminUsers();

  for (const user of users) {
    try {
      const keys = await listUserApiKeys(user);
      const key = keys.find((item) => toNumber(item.id) === apiKeyId);
      if (key) {
        return { user, key };
      }
    } catch {
      // Keep scanning other users; one inaccessible page should not block the mutation fallback.
    }
  }

  return undefined;
}

function buildForwardQuery(query, omittedKeys = []) {
  const omitted = new Set(omittedKeys);
  const params = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (omitted.has(key)) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, String(entry)));
      return;
    }

    if (value !== undefined) {
      params.set(key, String(value));
    }
  });

  const text = params.toString();
  return text ? `?${text}` : '';
}

function getOwnerIdFromRequest(req) {
  return toNumber(req.query.user_id)
    ?? toNumber(req.query.userId)
    ?? toNumber(req.query.owner_id)
    ?? toNumber(req.query.ownerId)
    ?? toNumber(req.body?.user_id)
    ?? toNumber(req.body?.userId)
    ?? toNumber(req.body?.owner_id)
    ?? toNumber(req.body?.ownerId);
}

function stripInternalApiKeyFields(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const {
    user_id: _userId,
    userId: _userIdCamel,
    owner_id: _ownerId,
    ownerId: _ownerIdCamel,
    ...payload
  } = body;

  return payload;
}

function buildUpstreamHeaders(req) {
  const headers = new Headers();

  headers.set('x-api-key', adminApiKey);
  headers.set('Authorization', formatAuthorizationHeader(adminApiKey));

  const contentType = req.headers['content-type'];
  if (contentType) {
    headers.set('content-type', contentType);
  }

  const idempotencyKey = req.headers['idempotency-key'];
  if (typeof idempotencyKey === 'string' && idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey);
  }

  return headers;
}

async function fetchUpstreamForProxy(req, upstreamPath, options = {}) {
  const upstreamUrl = new URL(`${upstreamBaseUrl}${upstreamPath}`);
  const method = options.method || req.method;
  const body = options.body === undefined ? req.body : options.body;
  const init = {
    method,
    headers: buildUpstreamHeaders(req),
  };

  const hasBody = body && typeof body === 'object' && Object.keys(body).length > 0;
  if (!['GET', 'HEAD'].includes(method) && (method !== 'DELETE' || hasBody)) {
    init.body = JSON.stringify(body || {});
  }

  const response = await fetch(upstreamUrl, init);
  const upstreamContentType = response.headers.get('content-type');
  const isJson = upstreamContentType?.includes('application/json');
  const rawText = await response.text();

  let responseBody;
  if (isJson && rawText.trim()) {
    const json = JSON.parse(rawText);
    responseBody = options.redactAccounts && upstreamPath.startsWith('/api/v1/admin/accounts')
      ? redactAccountCredentials(json)
      : json;
  } else {
    responseBody = rawText;
  }

  return {
    ok: response.ok,
    status: response.status,
    contentType: upstreamContentType,
    body: responseBody,
  };
}

function sendUpstreamResult(res, result) {
  if (result.contentType) {
    res.setHeader('content-type', result.contentType);
  }

  res.status(result.status).send(result.body);
}

function redactAccountCredentials(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const walk = (value) => {
    if (Array.isArray(value)) {
      return value.map(walk);
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const next = {};

    Object.entries(value).forEach(([key, entryValue]) => {
      if (key === 'credentials') {
        next[key] = { redacted: true };
        return;
      }

      next[key] = walk(entryValue);
    });

    return next;
  };

  return walk(payload);
}

async function proxyUpstreamRequest(req, res, options = {}) {
  if (!upstreamBaseUrl) {
    res.status(500).json({ code: 500, message: 'SUB2API_BASE_URL_NOT_CONFIGURED' });
    return;
  }

  if (!adminApiKey) {
    res.status(500).json({ code: 500, message: 'SUB2API_ADMIN_API_KEY_NOT_CONFIGURED' });
    return;
  }

  try {
    const result = await fetchUpstreamForProxy(req, req.originalUrl, {
      redactAccounts: options.redactAccounts,
    });
    sendUpstreamResult(res, result);
  } catch (error) {
    res.status(502).json({
      code: 502,
      message: 'UPSTREAM_REQUEST_FAILED',
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    });
  }
}

async function proxyApiKeyMutationRequest(req, res) {
  if (!upstreamBaseUrl) {
    res.status(500).json({ code: 500, message: 'SUB2API_BASE_URL_NOT_CONFIGURED' });
    return;
  }

  if (!adminApiKey) {
    res.status(500).json({ code: 500, message: 'SUB2API_ADMIN_API_KEY_NOT_CONFIGURED' });
    return;
  }

  const apiKeyId = toNumber(req.params.id);
  if (!apiKeyId) {
    res.status(400).json({ code: 400, message: 'INVALID_API_KEY_ID' });
    return;
  }

  const payload = stripInternalApiKeyFields(req.body);
  const query = buildForwardQuery(req.query, ['user_id', 'userId', 'owner_id', 'ownerId']);
  const paths = [];
  const ownerId = getOwnerIdFromRequest(req);

  if (ownerId) {
    paths.push(`/api/v1/admin/users/${ownerId}/api-keys/${apiKeyId}${query}`);
  } else {
    const owner = await findApiKeyOwner(apiKeyId);
    if (owner?.user?.id) {
      paths.push(`/api/v1/admin/users/${owner.user.id}/api-keys/${apiKeyId}${query}`);
    }
  }

  paths.push(`/api/v1/api-keys/${apiKeyId}${query}`);
  paths.push(`/api/v1/keys/${apiKeyId}${query}`);

  if (req.method === 'PUT' && payload && typeof payload === 'object') {
    const adminPayload = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'group_id')) {
      adminPayload.group_id = payload.group_id;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'reset_rate_limit_usage')) {
      adminPayload.reset_rate_limit_usage = payload.reset_rate_limit_usage;
    }
    if (Object.keys(adminPayload).length > 0 && Object.keys(payload).every((key) => key in adminPayload)) {
      paths.push(`/api/v1/admin/api-keys/${apiKeyId}${query}`);
    }
  }

  const uniquePaths = [...new Set(paths)];
  const failures = [];

  try {
    for (const path of uniquePaths) {
      const result = await fetchUpstreamForProxy(req, path, { body: payload });
      if (result.ok) {
        sendUpstreamResult(res, result);
        return;
      }

      failures.push(result);
    }

    const fallback = failures.find((result) => ![404, 405].includes(result.status)) ?? failures[0];
    sendUpstreamResult(res, fallback);
  } catch (error) {
    res.status(502).json({
      code: 502,
      message: 'UPSTREAM_REQUEST_FAILED',
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    });
  }
}

app.use(
  cors({
    origin: allowedOrigin === '*' ? true : allowedOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    upstreamConfigured: Boolean(upstreamBaseUrl),
    apiKeyConfigured: Boolean(adminApiKey),
  });
});

app.get('/api/v1/keys', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.page_size || 10), 1), 100);
    const search = String(req.query.search || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim();

    const users = await listAdminUsers();

    const keyPages = await Promise.all(
      users.map(async (user) => {
        return listUserApiKeys(user);
      })
    );

    let items = keyPages.flat();

    if (search) {
      items = items.filter((item) => {
        const haystack = [item.name, item.key, item.user_email, item.user?.email, item.user?.username, item.group_name, item.group?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      });
    }

    if (status) {
      items = items.filter((item) => item.status === status);
    }

    items.sort((left, right) => {
      const leftTime = new Date(left.updated_at || left.last_used_at || 0).getTime();
      const rightTime = new Date(right.updated_at || right.last_used_at || 0).getTime();
      return rightTime - leftTime;
    });

    const total = items.length;
    const start = (page - 1) * pageSize;
    const pagedItems = items.slice(start, start + pageSize);

    res.json({
      code: 0,
      message: 'success',
      data: {
        items: pagedItems,
        total,
        page,
        page_size: pageSize,
        pages: Math.max(Math.ceil(total / pageSize), 1),
      },
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error instanceof Error ? error.message : 'KEYS_AGGREGATION_FAILED',
    });
  }
});

app.use('/api/v1/keys/:id', async (req, res) => {
  if (['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    await proxyApiKeyMutationRequest(req, res);
    return;
  }

  await proxyUpstreamRequest(req, res);
});

app.use('/api/v1/api-keys', async (req, res) => {
  await proxyUpstreamRequest(req, res);
});

app.use('/api/v1/admin', async (req, res) => {
  await proxyUpstreamRequest(req, res, { redactAccounts: true });
});

app.use('/api/v1/usage', async (req, res) => {
  await proxyUpstreamRequest(req, res);
});

app.listen(port, () => {
  console.log(`Admin proxy listening on http://localhost:${port}`);
});
