import { hashPassword, verifyPassword, validatePassword, createSessionToken, hashSessionToken } from './auth.js';

const SESSION_COOKIE = 'novera_admin_session';
const SESSION_HOURS = 8;
const ROLES = new Set(['admin', 'editor', 'viewer']);
const INQUIRY_STATUSES = new Set(['new', 'contacted', 'qualified', 'closed', 'spam']);
const PRODUCT_FIELDS = [
  'category', 'category_label', 'code', 'title', 'summary', 'theme', 'image_url',
  'description', 'features', 'applications', 'substrates', 'performance', 'process',
  'package_info', 'document_url', 'position', 'is_published',
];
const SITE_SETTING_FIELDS = [
  'company_name', 'company_legal_name', 'company_tagline',
  'hero_primary', 'hero_emphasis', 'hero_intro',
  'about_hero_eyebrow', 'about_hero_primary', 'about_hero_emphasis', 'about_hero_intro',
  'about_primary', 'about_emphasis', 'about_body',
  'solutions_hero_eyebrow', 'solutions_hero_primary', 'solutions_hero_emphasis', 'solutions_hero_intro',
  'solutions_intro_eyebrow', 'solutions_intro_primary', 'solutions_intro_emphasis', 'solutions_intro_body',
  'contact_email', 'contact_phone_display', 'contact_phone_link', 'address',
];
const SOLUTION_FIELDS = ['title', 'summary', 'position', 'is_published'];

export function initializeAdminSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `);

  const inquiryColumns = database.prepare('PRAGMA table_info(inquiries)').all();
  if (!inquiryColumns.some((column) => column.name === 'internal_notes')) {
    database.exec("ALTER TABLE inquiries ADD COLUMN internal_notes TEXT NOT NULL DEFAULT '';");
  }
  if (!inquiryColumns.some((column) => column.name === 'updated_at')) {
    database.exec("ALTER TABLE inquiries ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';");
    database.exec("UPDATE inquiries SET updated_at = created_at WHERE updated_at = '';");
  }
  const inquiryMigrations = {
    inquiry_type: "TEXT NOT NULL DEFAULT 'general'",
    product_id: 'INTEGER REFERENCES products(id) ON DELETE SET NULL',
    product_code: "TEXT NOT NULL DEFAULT ''",
    product_title: "TEXT NOT NULL DEFAULT ''",
    quantity: "TEXT NOT NULL DEFAULT ''",
    desired_date: "TEXT NOT NULL DEFAULT ''",
  };
  Object.entries(inquiryMigrations).forEach(([columnName, definition]) => {
    if (!inquiryColumns.some((column) => column.name === columnName)) {
      database.exec(`ALTER TABLE inquiries ADD COLUMN ${columnName} ${definition};`);
    }
  });
  database.exec('CREATE INDEX IF NOT EXISTS idx_inquiries_product ON inquiries(product_id, product_code);');
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        return separator < 0 ? [part, ''] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function mapUser(row) {
  return row ? {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    isActive: Boolean(row.is_active),
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
  } : null;
}

function sanitizeProduct(body, normalizeText) {
  const product = {};
  for (const field of PRODUCT_FIELDS) {
    if (field === 'position') product[field] = Math.max(0, Number.parseInt(body[field], 10) || 0);
    else if (field === 'is_published') product[field] = body[field] === true || body[field] === 1 || body[field] === '1' ? 1 : 0;
    else product[field] = normalizeText(body[field], field === 'description' ? 6000 : 2000);
  }
  if (!product.category || !product.category_label || !product.code || !product.title || !product.summary) {
    return { error: '分类、分类名称、产品编号、产品名称和摘要为必填项。' };
  }
  return { product };
}

function normalizeImportBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return { skipped: true };
  if (['1', 'true', 'yes', 'y', 'published', '是', '发布'].includes(normalized)) return { value: 1 };
  if (['0', 'false', 'no', 'n', 'draft', 'unpublished', '否', '不发布'].includes(normalized)) return { value: 0 };
  return { error: '发布状态只能填写 1/0、是/否或 true/false。' };
}

function validateProductImport(rows, database, normalizeText) {
  if (!Array.isArray(rows) || rows.length === 0) return { errors: [{ row: 0, message: '表格中没有可导入的数据行。' }], entries: [] };
  if (rows.length > 1000) return { errors: [{ row: 0, message: '单次最多导入 1000 行产品数据。' }], entries: [] };

  const existingByCode = database.prepare('SELECT * FROM products WHERE code = ? COLLATE NOCASE');
  const errors = [];
  const entries = [];
  const seenCodes = new Set();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (!row || typeof row !== 'object') {
      errors.push({ row: rowNumber, message: '该行格式无效。' });
      return;
    }

    const code = normalizeText(row.code, 100);
    if (!code) {
      errors.push({ row: rowNumber, message: '缺少产品编号 code。' });
      return;
    }
    if (seenCodes.has(code.toLowerCase())) {
      errors.push({ row: rowNumber, code, message: '同一文件中出现重复的产品编号。' });
      return;
    }
    seenCodes.add(code.toLowerCase());

    const values = { code };
    for (const field of PRODUCT_FIELDS) {
      if (field === 'code' || !Object.hasOwn(row, field)) continue;
      const rawValue = row[field];
      if (String(rawValue ?? '').trim() === '') continue;
      if (field === 'position') {
        const position = Number.parseInt(rawValue, 10);
        if (!Number.isInteger(position) || position < 0) errors.push({ row: rowNumber, code, message: 'position 必须是大于或等于 0 的整数。' });
        else values.position = position;
      } else if (field === 'is_published') {
        const published = normalizeImportBoolean(rawValue);
        if (published.error) errors.push({ row: rowNumber, code, message: published.error });
        else if (!published.skipped) values.is_published = published.value;
      } else {
        const text = String(rawValue).trim().toLowerCase() === '[clear]' ? '' : normalizeText(rawValue, field === 'description' ? 6000 : 2000);
        values[field] = text;
      }
    }

    if (Object.values(values).some((value) => typeof value === 'string' && /鈥|�/.test(value))) {
      errors.push({ row: rowNumber, code, message: '检测到疑似乱码，请将 Excel 文件另存为 CSV UTF-8 后重新导入。' });
    }

    const existing = existingByCode.get(code);
    if (!existing) {
      for (const field of ['category', 'category_label', 'title', 'summary']) {
        if (!values[field]) errors.push({ row: rowNumber, code, message: `新增产品必须填写 ${field}。` });
      }
    }
    entries.push({ row: rowNumber, code, existing, values, action: existing ? 'update' : 'create' });
  });

  return { errors, entries };
}

function validateSettingsImport(rows, normalizeText) {
  if (!Array.isArray(rows) || !rows.length) return { errors: [{ row: 0, message: '表格中没有可导入的内容。' }], entries: [] };
  if (rows.length > 200) return { errors: [{ row: 0, message: '单次最多导入 200 行内容。' }], entries: [] };
  const errors = [];
  const entries = [];
  const seenKeys = new Set();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const key = normalizeText(row?.key, 100);
    if (!SITE_SETTING_FIELDS.includes(key)) {
      errors.push({ row: rowNumber, key, message: key ? '该字段不允许通过后台修改。' : '缺少 key 字段。' });
      return;
    }
    if (seenKeys.has(key)) {
      errors.push({ row: rowNumber, key, message: '同一文件中出现重复字段。' });
      return;
    }
    seenKeys.add(key);
    const rawValue = typeof row.value === 'string' ? row.value.trim() : '';
    if (!rawValue) return;
    const value = rawValue.toLowerCase() === '[clear]' ? '' : normalizeText(rawValue, 6000);
    if (/鈥|�/.test(value)) errors.push({ row: rowNumber, key, message: '检测到疑似乱码，请另存为 CSV UTF-8 后重新导入。' });
    entries.push({ row: rowNumber, key, value });
  });
  if (!entries.length && !errors.length) errors.push({ row: 0, message: '没有可更新的非空内容；清空字段请填写 [clear]。' });
  return { errors, entries };
}

function sanitizeSolution(body, normalizeText, requireAll = true) {
  const values = {};
  if (Object.hasOwn(body, 'title')) values.title = normalizeText(body.title, 200);
  if (Object.hasOwn(body, 'summary')) values.summary = normalizeText(body.summary, 2000);
  if (Object.hasOwn(body, 'position') && String(body.position).trim() !== '') {
    const position = Number.parseInt(body.position, 10);
    if (!Number.isInteger(position) || position < 0) return { error: 'position 必须是大于或等于 0 的整数。' };
    values.position = position;
  }
  if (Object.hasOwn(body, 'is_published') && String(body.is_published).trim() !== '') {
    const published = normalizeImportBoolean(body.is_published);
    if (published.error) return { error: published.error };
    if (!published.skipped) values.is_published = published.value;
  }
  if (requireAll && (!values.title || !values.summary)) return { error: '方案名称和摘要为必填项。' };
  return { values };
}

function validateSolutionImport(rows, database, normalizeText) {
  if (!Array.isArray(rows) || !rows.length) return { errors: [{ row: 0, message: '表格中没有可导入的方案。' }], entries: [] };
  if (rows.length > 500) return { errors: [{ row: 0, message: '单次最多导入 500 行方案。' }], entries: [] };
  const existingByTitle = database.prepare('SELECT * FROM solutions WHERE title = ? COLLATE NOCASE');
  const errors = [];
  const entries = [];
  const seenTitles = new Set();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const title = normalizeText(row?.title, 200);
    if (!title) { errors.push({ row: rowNumber, message: '缺少方案名称 title。' }); return; }
    if (seenTitles.has(title.toLowerCase())) { errors.push({ row: rowNumber, title, message: '同一文件中出现重复方案名称。' }); return; }
    seenTitles.add(title.toLowerCase());
    const sanitized = sanitizeSolution(row, normalizeText, false);
    if (sanitized.error) { errors.push({ row: rowNumber, title, message: sanitized.error }); return; }
    const values = sanitized.values;
    const existing = existingByTitle.get(title);
    if (!existing && !values.summary) errors.push({ row: rowNumber, title, message: '新增方案必须填写 summary。' });
    if (Object.values(values).some((value) => typeof value === 'string' && /鈥|�/.test(value))) errors.push({ row: rowNumber, title, message: '检测到疑似乱码，请另存为 CSV UTF-8 后重新导入。' });
    entries.push({ row: rowNumber, title, values, existing, action: existing ? 'update' : 'create' });
  });
  return { errors, entries };
}

export function createAdminHandler({ database, sendJson, readRequestBody, normalizeText }) {
  initializeAdminSchema(database);
  const failedLogins = new Map();

  const statements = {
    userByUsername: database.prepare('SELECT * FROM users WHERE username = ?'),
    userBySession: database.prepare(`
      SELECT users.* FROM admin_sessions
      JOIN users ON users.id = admin_sessions.user_id
      WHERE admin_sessions.token_hash = ? AND admin_sessions.expires_at > CURRENT_TIMESTAMP AND users.is_active = 1
    `),
    insertSession: database.prepare('INSERT INTO admin_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    deleteSession: database.prepare('DELETE FROM admin_sessions WHERE token_hash = ?'),
    deleteExpiredSessions: database.prepare('DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP'),
    audit: database.prepare('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)'),
  };

  function send(response, statusCode, payload, headers = {}) {
    response.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    response.end(JSON.stringify(payload));
  }

  function getSession(request) {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (!token) return { user: null, tokenHash: '' };
    const tokenHash = hashSessionToken(token);
    return { user: statements.userBySession.get(tokenHash), tokenHash };
  }

  function authorize(request, response, allowedRoles = ['admin', 'editor', 'viewer']) {
    const session = getSession(request);
    if (!session.user) {
      send(response, 401, { error: '请先登录后台。' });
      return null;
    }
    if (!allowedRoles.includes(session.user.role)) {
      send(response, 403, { error: '当前账号没有执行此操作的权限。' });
      return null;
    }
    return session;
  }

  function audit(userId, action, entityType, entityId = '', details = '') {
    statements.audit.run(userId, action, entityType, String(entityId), String(details).slice(0, 2000));
  }

  function checkMutationOrigin(request, response) {
    const origin = request.headers.origin;
    const expectedOrigin = `http://${request.headers.host}`;
    if (origin && origin !== expectedOrigin) {
      send(response, 403, { error: '请求来源验证失败。' });
      return false;
    }
    return true;
  }

  async function handler(request, response, url) {
    const pathname = url.pathname;
    if (!pathname.startsWith('/api/admin/')) return false;

    statements.deleteExpiredSessions.run();
    if (!['GET', 'HEAD'].includes(request.method) && !checkMutationOrigin(request, response)) return true;

    if (request.method === 'POST' && pathname === '/api/admin/login') {
      const key = request.socket.remoteAddress || 'local';
      const attempt = failedLogins.get(key) || { count: 0, blockedUntil: 0 };
      if (attempt.blockedUntil > Date.now()) {
        send(response, 429, { error: '登录尝试次数过多，请稍后再试。' });
        return true;
      }

      const body = await readRequestBody(request);
      const username = normalizeText(body.username, 80);
      const password = typeof body.password === 'string' ? body.password : '';
      const user = statements.userByUsername.get(username);
      if (!user || !user.is_active || !verifyPassword(password, user.password_salt, user.password_hash)) {
        attempt.count += 1;
        if (attempt.count >= 5) {
          attempt.blockedUntil = Date.now() + 15 * 60 * 1000;
          attempt.count = 0;
        }
        failedLogins.set(key, attempt);
        send(response, 401, { error: '用户名或密码错误。' });
        return true;
      }

      failedLogins.delete(key);
      const token = createSessionToken();
      const tokenHash = hashSessionToken(token);
      const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
      statements.insertSession.run(tokenHash, user.id, expiresAt);
      audit(user.id, 'login', 'session');
      send(response, 200, { user: mapUser(user) }, { 'Set-Cookie': sessionCookie(token, SESSION_HOURS * 60 * 60) });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/admin/logout') {
      const session = getSession(request);
      if (session.tokenHash) statements.deleteSession.run(session.tokenHash);
      if (session.user) audit(session.user.id, 'logout', 'session');
      send(response, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/admin/me') {
      const session = authorize(request, response);
      if (!session) return true;
      send(response, 200, { user: mapUser(session.user) });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/admin/dashboard') {
      const session = authorize(request, response);
      if (!session) return true;
      const counts = {
        products: database.prepare('SELECT COUNT(*) AS count FROM products').get().count,
        publishedProducts: database.prepare('SELECT COUNT(*) AS count FROM products WHERE is_published = 1').get().count,
        inquiries: database.prepare('SELECT COUNT(*) AS count FROM inquiries').get().count,
        newInquiries: database.prepare("SELECT COUNT(*) AS count FROM inquiries WHERE status = 'new'").get().count,
        users: session.user.role === 'admin' ? database.prepare('SELECT COUNT(*) AS count FROM users WHERE is_active = 1').get().count : null,
      };
      const recentInquiries = database.prepare(`
        SELECT id, inquiry_type, product_code, product_title, name, company, application, status, created_at
        FROM inquiries ORDER BY created_at DESC LIMIT 8
      `).all();
      send(response, 200, { counts, recentInquiries });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/admin/notifications') {
      const session = authorize(request, response);
      if (!session) return true;
      const newInquiries = database.prepare("SELECT COUNT(*) AS count FROM inquiries WHERE status = 'new'").get().count;
      const latest = database.prepare(`
        SELECT id, inquiry_type, product_code, product_title, name, company, created_at
        FROM inquiries WHERE status = 'new' ORDER BY created_at DESC LIMIT 5
      `).all();
      send(response, 200, { newInquiries, latest });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/admin/content') {
      const session = authorize(request, response);
      if (!session) return true;
      const settings = Object.fromEntries(database.prepare(`SELECT key, value FROM settings WHERE key IN (${SITE_SETTING_FIELDS.map(() => '?').join(', ')}) ORDER BY key`).all(...SITE_SETTING_FIELDS).map(({ key, value }) => [key, value]));
      const stats = database.prepare('SELECT id, value, label, position FROM stats ORDER BY position, id').all();
      send(response, 200, { settings, stats, allowedKeys: SITE_SETTING_FIELDS });
      return true;
    }

    if (request.method === 'PUT' && pathname === '/api/admin/content') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const body = await readRequestBody(request);
      const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};
      const settingEntries = Object.entries(settings).filter(([key]) => SITE_SETTING_FIELDS.includes(key)).map(([key, value]) => [key, normalizeText(value, 6000)]);
      const stats = Array.isArray(body.stats) ? body.stats : null;
      if (!settingEntries.length && !stats) { send(response, 400, { error: '没有可保存的内容。' }); return true; }
      if (stats) {
        if (stats.length > 20) { send(response, 400, { error: '企业数字最多 20 条。' }); return true; }
        for (const item of stats) {
          const position = Number.parseInt(item.position, 10);
          if (!normalizeText(item.value, 100) || !normalizeText(item.label, 200) || !Number.isInteger(position) || position < 0) {
            send(response, 400, { error: '企业数字的数值、说明和排序均需正确填写。' }); return true;
          }
        }
      }
      database.exec('BEGIN IMMEDIATE;');
      try {
        const upsertSetting = database.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`);
        settingEntries.forEach(([key, value]) => upsertSetting.run(key, value));
        if (stats) {
          database.exec('DELETE FROM stats;');
          const insertStat = database.prepare('INSERT INTO stats (value, label, position) VALUES (?, ?, ?)');
          stats.forEach((item) => insertStat.run(normalizeText(item.value, 100), normalizeText(item.label, 200), Number.parseInt(item.position, 10)));
        }
        database.exec('COMMIT;');
      } catch {
        database.exec('ROLLBACK;');
        send(response, 400, { error: '网站内容保存失败，数据库未发生变更。' }); return true;
      }
      audit(session.user.id, 'update', 'content', '', JSON.stringify({ settings: settingEntries.length, stats: stats?.length ?? 'unchanged' }));
      send(response, 200, { ok: true });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/admin/import/content/preview') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const body = await readRequestBody(request);
      const validation = validateSettingsImport(body.rows, normalizeText);
      send(response, 200, {
        summary: { total: Array.isArray(body.rows) ? body.rows.length : 0, update: validation.entries.length, errors: validation.errors.length },
        errors: validation.errors.slice(0, 100), preview: validation.entries.slice(0, 30),
        canImport: validation.entries.length > 0 && validation.errors.length === 0,
      });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/admin/import/content') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const body = await readRequestBody(request);
      const validation = validateSettingsImport(body.rows, normalizeText);
      if (validation.errors.length || !validation.entries.length) { send(response, 400, { error: '内容表格未通过校验，请重新预检。', errors: validation.errors.slice(0, 100) }); return true; }
      const upsertSetting = database.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`);
      database.exec('BEGIN IMMEDIATE;');
      try { validation.entries.forEach(({ key, value }) => upsertSetting.run(key, value)); database.exec('COMMIT;'); }
      catch { database.exec('ROLLBACK;'); send(response, 400, { error: '内容导入失败，数据库未发生变更。' }); return true; }
      audit(session.user.id, 'import', 'content', '', JSON.stringify({ fileName: normalizeText(body.fileName, 200), updated: validation.entries.length }));
      send(response, 200, { ok: true, updated: validation.entries.length });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/admin/solutions') {
      const session = authorize(request, response);
      if (!session) return true;
      send(response, 200, { solutions: database.prepare('SELECT * FROM solutions ORDER BY position, id').all() });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/admin/solutions') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const result = sanitizeSolution(await readRequestBody(request), normalizeText);
      if (result.error) { send(response, 400, { error: result.error }); return true; }
      const values = { position: 0, is_published: 1, ...result.values };
      const insertion = database.prepare('INSERT INTO solutions (title, summary, position, is_published) VALUES (?, ?, ?, ?)').run(values.title, values.summary, values.position, values.is_published);
      audit(session.user.id, 'create', 'solution', insertion.lastInsertRowid, values.title);
      send(response, 201, { ok: true, solutionId: Number(insertion.lastInsertRowid) });
      return true;
    }

    const solutionMatch = pathname.match(/^\/api\/admin\/solutions\/(\d+)$/);
    if (solutionMatch && request.method === 'PUT') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const result = sanitizeSolution(await readRequestBody(request), normalizeText);
      if (result.error) { send(response, 400, { error: result.error }); return true; }
      const values = { position: 0, is_published: 1, ...result.values };
      const update = database.prepare('UPDATE solutions SET title = ?, summary = ?, position = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(values.title, values.summary, values.position, values.is_published, Number(solutionMatch[1]));
      if (!update.changes) { send(response, 404, { error: '解决方案不存在。' }); return true; }
      audit(session.user.id, 'update', 'solution', solutionMatch[1], values.title);
      send(response, 200, { ok: true });
      return true;
    }

    if (solutionMatch && request.method === 'DELETE') {
      const session = authorize(request, response, ['admin']);
      if (!session) return true;
      const solution = database.prepare('SELECT title FROM solutions WHERE id = ?').get(Number(solutionMatch[1]));
      if (!solution) { send(response, 404, { error: '解决方案不存在。' }); return true; }
      database.prepare('DELETE FROM solutions WHERE id = ?').run(Number(solutionMatch[1]));
      audit(session.user.id, 'delete', 'solution', solutionMatch[1], solution.title);
      send(response, 200, { ok: true });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/admin/import/solutions/preview') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const body = await readRequestBody(request);
      const validation = validateSolutionImport(body.rows, database, normalizeText);
      send(response, 200, {
        summary: { total: Array.isArray(body.rows) ? body.rows.length : 0, create: validation.entries.filter((entry) => entry.action === 'create').length, update: validation.entries.filter((entry) => entry.action === 'update').length, errors: validation.errors.length },
        errors: validation.errors.slice(0, 100), preview: validation.entries.slice(0, 30).map(({ row, title, action, values }) => ({ row, title, action, summary: values.summary || '' })),
        canImport: validation.entries.length > 0 && validation.errors.length === 0,
      });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/admin/import/solutions') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const body = await readRequestBody(request);
      const validation = validateSolutionImport(body.rows, database, normalizeText);
      if (validation.errors.length || !validation.entries.length) { send(response, 400, { error: 'Solutions 表格未通过校验，请重新预检。', errors: validation.errors.slice(0, 100) }); return true; }
      let created = 0; let updated = 0;
      database.exec('BEGIN IMMEDIATE;');
      try {
        for (const entry of validation.entries) {
          if (entry.action === 'create') {
            database.prepare('INSERT INTO solutions (title, summary, position, is_published) VALUES (?, ?, ?, ?)').run(entry.values.title, entry.values.summary, entry.values.position ?? 0, entry.values.is_published ?? 1); created += 1;
          } else {
            const fields = Object.keys(entry.values).filter((field) => field !== 'title' && SOLUTION_FIELDS.includes(field));
            if (fields.length) database.prepare(`UPDATE solutions SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...fields.map((field) => entry.values[field]), entry.existing.id);
            updated += 1;
          }
        }
        database.exec('COMMIT;');
      } catch { database.exec('ROLLBACK;'); send(response, 400, { error: 'Solutions 导入失败，数据库未发生变更。' }); return true; }
      audit(session.user.id, 'import', 'solution', '', JSON.stringify({ fileName: normalizeText(body.fileName, 200), created, updated }));
      send(response, 200, { ok: true, created, updated });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/admin/products') {
      const session = authorize(request, response);
      if (!session) return true;
      const products = database.prepare('SELECT * FROM products ORDER BY position, id').all();
      send(response, 200, { products });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/admin/import/products/preview') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const body = await readRequestBody(request);
      const validation = validateProductImport(body.rows, database, normalizeText);
      const summary = {
        total: Array.isArray(body.rows) ? body.rows.length : 0,
        create: validation.entries.filter((entry) => entry.action === 'create').length,
        update: validation.entries.filter((entry) => entry.action === 'update').length,
        errors: validation.errors.length,
      };
      send(response, 200, {
        summary,
        errors: validation.errors.slice(0, 100),
        preview: validation.entries.slice(0, 20).map(({ row, code, action, values }) => ({ row, code, action, title: values.title || '' })),
        canImport: validation.errors.length === 0 && validation.entries.length > 0,
      });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/admin/import/products') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const body = await readRequestBody(request);
      const validation = validateProductImport(body.rows, database, normalizeText);
      if (validation.errors.length || !validation.entries.length) {
        send(response, 400, { error: '导入数据未通过校验，请重新预检。', errors: validation.errors.slice(0, 100) });
        return true;
      }

      let created = 0;
      let updated = 0;
      database.exec('BEGIN IMMEDIATE;');
      try {
        for (const entry of validation.entries) {
          if (entry.action === 'create') {
            const product = Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, '']));
            Object.assign(product, { theme: 'mint', position: 0, is_published: 1 }, entry.values);
            database.prepare(`INSERT INTO products (${PRODUCT_FIELDS.join(', ')}) VALUES (${PRODUCT_FIELDS.map(() => '?').join(', ')})`).run(...PRODUCT_FIELDS.map((field) => product[field]));
            created += 1;
          } else {
            const fields = Object.keys(entry.values).filter((field) => field !== 'code' && PRODUCT_FIELDS.includes(field));
            if (fields.length) {
              database.prepare(`UPDATE products SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE code = ?`).run(...fields.map((field) => entry.values[field]), entry.existing.code);
            }
            updated += 1;
          }
        }
        database.exec('COMMIT;');
      } catch (error) {
        database.exec('ROLLBACK;');
        send(response, 400, { error: error.message.includes('UNIQUE') ? '表格中包含重复的产品编号。' : '导入失败，数据库未发生变更。' });
        return true;
      }

      const fileName = normalizeText(body.fileName, 200);
      audit(session.user.id, 'import', 'product', '', JSON.stringify({ fileName, created, updated }));
      send(response, 200, { ok: true, created, updated });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/admin/products') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const body = await readRequestBody(request);
      const result = sanitizeProduct(body, normalizeText);
      if (result.error) { send(response, 400, { error: result.error }); return true; }
      const p = result.product;
      try {
        const insertion = database.prepare(`
          INSERT INTO products (${PRODUCT_FIELDS.join(', ')}) VALUES (${PRODUCT_FIELDS.map(() => '?').join(', ')})
        `).run(...PRODUCT_FIELDS.map((field) => p[field]));
        audit(session.user.id, 'create', 'product', insertion.lastInsertRowid, p.code);
        send(response, 201, { ok: true, productId: Number(insertion.lastInsertRowid) });
      } catch (error) {
        send(response, 400, { error: error.message.includes('UNIQUE') ? '产品编号已存在。' : '无法创建产品。' });
      }
      return true;
    }

    const productMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
    if (productMatch && request.method === 'PUT') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const body = await readRequestBody(request);
      const result = sanitizeProduct(body, normalizeText);
      if (result.error) { send(response, 400, { error: result.error }); return true; }
      const productId = Number(productMatch[1]);
      const p = result.product;
      try {
        const update = database.prepare(`
          UPDATE products SET ${PRODUCT_FIELDS.map((field) => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(...PRODUCT_FIELDS.map((field) => p[field]), productId);
        if (!update.changes) { send(response, 404, { error: '产品不存在。' }); return true; }
        audit(session.user.id, 'update', 'product', productId, p.code);
        send(response, 200, { ok: true });
      } catch (error) {
        send(response, 400, { error: error.message.includes('UNIQUE') ? '产品编号已存在。' : '无法修改产品。' });
      }
      return true;
    }

    if (productMatch && request.method === 'DELETE') {
      const session = authorize(request, response, ['admin']);
      if (!session) return true;
      const productId = Number(productMatch[1]);
      const product = database.prepare('SELECT code FROM products WHERE id = ?').get(productId);
      if (!product) { send(response, 404, { error: '产品不存在。' }); return true; }
      database.prepare('DELETE FROM products WHERE id = ?').run(productId);
      audit(session.user.id, 'delete', 'product', productId, product.code);
      send(response, 200, { ok: true });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/admin/inquiries') {
      const session = authorize(request, response);
      if (!session) return true;
      const status = url.searchParams.get('status');
      const inquiries = status && INQUIRY_STATUSES.has(status)
        ? database.prepare('SELECT * FROM inquiries WHERE status = ? ORDER BY created_at DESC').all(status)
        : database.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all();
      send(response, 200, { inquiries });
      return true;
    }

    const inquiryMatch = pathname.match(/^\/api\/admin\/inquiries\/(\d+)$/);
    if (inquiryMatch && request.method === 'PATCH') {
      const session = authorize(request, response, ['admin', 'editor']);
      if (!session) return true;
      const body = await readRequestBody(request);
      const status = normalizeText(body.status, 30);
      const internalNotes = normalizeText(body.internal_notes, 5000);
      if (!INQUIRY_STATUSES.has(status)) { send(response, 400, { error: '询盘状态无效。' }); return true; }
      const inquiryId = Number(inquiryMatch[1]);
      const update = database.prepare(`UPDATE inquiries SET status = ?, internal_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, internalNotes, inquiryId);
      if (!update.changes) { send(response, 404, { error: '询盘不存在。' }); return true; }
      audit(session.user.id, 'update', 'inquiry', inquiryId, status);
      send(response, 200, { ok: true });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/admin/users') {
      const session = authorize(request, response, ['admin']);
      if (!session) return true;
      const users = database.prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(mapUser);
      send(response, 200, { users });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/admin/users') {
      const session = authorize(request, response, ['admin']);
      if (!session) return true;
      const body = await readRequestBody(request);
      const username = normalizeText(body.username, 80);
      const displayName = normalizeText(body.displayName, 120);
      const role = normalizeText(body.role, 20);
      const password = typeof body.password === 'string' ? body.password : '';
      const passwordError = validatePassword(password);
      if (!username || !displayName || !ROLES.has(role) || passwordError) {
        send(response, 400, { error: passwordError || '用户名、显示名称或角色无效。' });
        return true;
      }
      const credentials = hashPassword(password);
      try {
        const insertion = database.prepare(`
          INSERT INTO users (username, display_name, password_hash, password_salt, role, must_change_password)
          VALUES (?, ?, ?, ?, ?, 1)
        `).run(username, displayName, credentials.hash, credentials.salt, role);
        audit(session.user.id, 'create', 'user', insertion.lastInsertRowid, `${username}:${role}`);
        send(response, 201, { ok: true, userId: Number(insertion.lastInsertRowid) });
      } catch (error) {
        send(response, 400, { error: error.message.includes('UNIQUE') ? '用户名已存在。' : '无法创建用户。' });
      }
      return true;
    }

    const userMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (userMatch && request.method === 'PATCH') {
      const session = authorize(request, response, ['admin']);
      if (!session) return true;
      const targetId = Number(userMatch[1]);
      const body = await readRequestBody(request);
      const role = normalizeText(body.role, 20);
      const isActive = body.isActive ? 1 : 0;
      if (!ROLES.has(role)) { send(response, 400, { error: '用户角色无效。' }); return true; }
      if (targetId === session.user.id && !isActive) { send(response, 400, { error: '不能禁用当前登录账号。' }); return true; }
      if (targetId === session.user.id && role !== 'admin') { send(response, 400, { error: '不能降低当前登录管理员的权限。' }); return true; }
      const targetUser = database.prepare('SELECT role, is_active FROM users WHERE id = ?').get(targetId);
      if (!targetUser) { send(response, 404, { error: '用户不存在。' }); return true; }
      if (targetUser.role === 'admin' && targetUser.is_active && (role !== 'admin' || !isActive)) {
        const activeAdminCount = database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1").get().count;
        if (activeAdminCount <= 1) { send(response, 400, { error: '至少需要保留一个启用的管理员账号。' }); return true; }
      }
      const update = database.prepare('UPDATE users SET role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, isActive, targetId);
      audit(session.user.id, 'update', 'user', targetId, `${role}:${isActive}`);
      send(response, 200, { ok: true });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/admin/change-password') {
      const session = authorize(request, response);
      if (!session) return true;
      const body = await readRequestBody(request);
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      if (!verifyPassword(currentPassword, session.user.password_salt, session.user.password_hash)) {
        send(response, 400, { error: '当前密码不正确。' });
        return true;
      }
      const passwordError = validatePassword(newPassword);
      if (passwordError) { send(response, 400, { error: passwordError }); return true; }
      const credentials = hashPassword(newPassword);
      database.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(credentials.hash, credentials.salt, session.user.id);
      database.prepare('DELETE FROM admin_sessions WHERE user_id = ? AND token_hash <> ?').run(session.user.id, session.tokenHash);
      audit(session.user.id, 'change_password', 'user', session.user.id);
      send(response, 200, { ok: true });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/admin/audit-logs') {
      const session = authorize(request, response, ['admin']);
      if (!session) return true;
      const logs = database.prepare(`
        SELECT audit_logs.*, users.username FROM audit_logs
        LEFT JOIN users ON users.id = audit_logs.user_id
        ORDER BY audit_logs.created_at DESC LIMIT 200
      `).all();
      send(response, 200, { logs });
      return true;
    }

    sendJson(response, 404, { error: '后台 API 路径不存在。' });
    return true;
  }

  return handler;
}
