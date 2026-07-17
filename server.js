import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createAdminHandler } from './lib/admin.js';

const rootDirectory = fileURLToPath(new URL('.', import.meta.url));
const dataDirectory = join(rootDirectory, 'data');
const databaseDirectory = join(rootDirectory, 'database');
const databasePath = join(dataDirectory, 'site.sqlite');
const port = Number(process.env.PORT || 4173);

mkdirSync(dataDirectory, { recursive: true });

// 初始化 SQLite，并启用外键和 WAL 日志模式以改善本地并发读写。
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON;');
database.exec('PRAGMA journal_mode = WAL;');
database.exec(readFileSync(join(databaseDirectory, 'schema.sql'), 'utf8'));

// 兼容升级前创建的数据库：按需补充新增字段，不删除原有内容。
const productColumns = database.prepare('PRAGMA table_info(products)').all();
const productMigrations = ['image_url', 'description', 'features', 'applications', 'substrates', 'performance', 'process', 'package_info', 'document_url'];
productMigrations.forEach((columnName) => {
  if (!productColumns.some((column) => column.name === columnName)) {
    database.exec(`ALTER TABLE products ADD COLUMN ${columnName} TEXT NOT NULL DEFAULT '';`);
  }
});

const inquiryColumns = database.prepare('PRAGMA table_info(inquiries)').all();
const inquiryMigrations = {
  company: "TEXT NOT NULL DEFAULT ''",
  phone: "TEXT NOT NULL DEFAULT ''",
  region: "TEXT NOT NULL DEFAULT ''",
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

// 仅在全新数据库中写入演示数据，避免覆盖用户后续修改的内容。
const settingsCount = database.prepare('SELECT COUNT(*) AS count FROM settings').get().count;
if (settingsCount === 0) {
  database.exec(readFileSync(join(databaseDirectory, 'seed.sql'), 'utf8'));
}

// 为已有数据库补充新增的可编辑页面文案，不覆盖用户已经设置的内容。
const pageContentDefaults = {
  about_hero_eyebrow: 'The TeiKyo approach',
  about_hero_primary: 'Coating expertise.',
  about_hero_emphasis: 'Practical results.',
  about_hero_intro: 'A coating company focused on reliable waterborne and solventborne solutions.',
  solutions_hero_eyebrow: 'Waterborne & solventborne expertise',
  solutions_hero_primary: 'Choose the chemistry',
  solutions_hero_emphasis: 'your process needs.',
  solutions_hero_intro: 'TeiKyo connects resin selection, application engineering and film-performance validation.',
  solutions_intro_eyebrow: 'Coating solutions',
  solutions_intro_primary: 'From substrate to',
  solutions_intro_emphasis: 'finished surface.',
  solutions_intro_body: 'Each solution starts with the substrate, application method, drying or curing conditions and service environment.',
};
const insertSettingDefault = database.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
Object.entries(pageContentDefaults).forEach(([key, value]) => insertSettingDefault.run(key, value));

const queries = {
  settings: database.prepare('SELECT key, value FROM settings ORDER BY key'),
  stats: database.prepare('SELECT id, value, label, position FROM stats ORDER BY position, id'),
  products: database.prepare(`
    SELECT id, category, category_label, code, title, summary, theme, image_url,
           description, features, applications, substrates, performance, process,
           package_info, document_url, position
    FROM products
    WHERE is_published = 1
    ORDER BY position, id
  `),
  solutions: database.prepare(`
    SELECT id, title, summary, position
    FROM solutions
    WHERE is_published = 1
    ORDER BY position, id
  `),
  insights: database.prepare(`
    SELECT id, type, title, summary, published_at, read_time, is_featured
    FROM insights
    WHERE is_published = 1
    ORDER BY is_featured DESC, published_at DESC, id DESC
  `),
  insertInquiry: database.prepare(`
    INSERT INTO inquiries (
      inquiry_type, product_id, product_code, product_title,
      name, company, email, phone, region, application, quantity, desired_date, message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  productForInquiryByCode: database.prepare('SELECT id, code, title FROM products WHERE is_published = 1 AND code = ? LIMIT 1'),
  productForInquiryById: database.prepare('SELECT id, code, title FROM products WHERE is_published = 1 AND id = ? LIMIT 1'),
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const publicExtensions = new Set(Object.keys(mimeTypes));
const blockedPaths = ['/data/', '/database/', '/docs/', '/imports/', '/lib/', '/scripts/', '/.git/', '/server.js', '/package.json'];

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function getContent() {
  const settings = Object.fromEntries(queries.settings.all().map(({ key, value }) => [key, value]));
  return {
    settings,
    stats: queries.stats.all(),
    products: queries.products.all(),
    solutions: queries.solutions.all(),
    insights: queries.insights.all(),
  };
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        rejectBody(new Error('请求内容不能超过 1 MB'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        rejectBody(new Error('请求内容不是有效的 JSON'));
      }
    });

    request.on('error', rejectBody);
  });
}

function normalizeText(value, maximumLength) {
  return typeof value === 'string' ? value.trim().slice(0, maximumLength) : '';
}

// 后台 API 独立封装，统一处理登录会话、角色权限和审计日志。
const handleAdminApi = createAdminHandler({ database, sendJson, readRequestBody, normalizeText });

async function handleApi(request, response, pathname) {
  if (request.method === 'GET' && pathname === '/api/health') {
    sendJson(response, 200, { ok: true, database: 'sqlite' });
    return true;
  }

  if (request.method === 'GET' && pathname === '/api/content') {
    sendJson(response, 200, getContent());
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/inquiries') {
    try {
      const body = await readRequestBody(request);
      const name = normalizeText(body.name, 100);
      const company = normalizeText(body.company, 200);
      const email = normalizeText(body.email, 200);
      const phone = normalizeText(body.phone, 100);
      const region = normalizeText(body.region, 100);
      const application = normalizeText(body.application, 100);
      const inquiryType = body.inquiry_type === 'product_reservation' ? 'product_reservation' : 'general';
      const requestedProductId = Number.parseInt(body.product_id, 10) || 0;
      const requestedProductCode = normalizeText(body.product_code, 100);
      const quantity = normalizeText(body.quantity, 100);
      const desiredDate = normalizeText(body.desired_date, 30);
      const message = normalizeText(body.message, 4000);

      if (!name || !email || !message) {
        sendJson(response, 400, { error: '姓名、邮箱和项目说明均为必填项。' });
        return true;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(response, 400, { error: '请输入有效的邮箱地址。' });
        return true;
      }

      let product = null;
      if (inquiryType === 'product_reservation') {
        product = requestedProductCode
          ? queries.productForInquiryByCode.get(requestedProductCode)
          : queries.productForInquiryById.get(requestedProductId);
        if (!product || (requestedProductId && product.id !== requestedProductId)) {
          sendJson(response, 400, { error: '所选产品不存在或暂未发布，请重新选择。' });
          return true;
        }
        if (!quantity) {
          sendJson(response, 400, { error: '请填写预计需求数量。' });
          return true;
        }
        if (desiredDate && !/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) {
          sendJson(response, 400, { error: '期望日期格式无效。' });
          return true;
        }
      }

      const result = queries.insertInquiry.run(
        inquiryType,
        product?.id || null,
        product?.code || '',
        product?.title || '',
        name,
        company,
        email,
        phone,
        region,
        application,
        quantity,
        desiredDate,
        message,
      );
      sendJson(response, 201, { ok: true, inquiryId: Number(result.lastInsertRowid) });
      return true;
    } catch (error) {
      sendJson(response, 400, { error: error.message || '无法处理询盘。' });
      return true;
    }
  }

  if (pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: 'API 路径不存在。' });
    return true;
  }

  return false;
}

function serveStaticFile(response, pathname) {
  const staticRoutes = {
    '/': '/index.html',
    '/admin': '/admin/index.html',
    '/admin/': '/admin/index.html',
    '/admin/login': '/admin/login.html',
  };
  const requestedPath = staticRoutes[pathname] || decodeURIComponent(pathname);
  const normalizedUrlPath = requestedPath.replaceAll('\\', '/');

  if (blockedPaths.some((blockedPath) => normalizedUrlPath === blockedPath || normalizedUrlPath.startsWith(blockedPath))) {
    sendJson(response, 404, { error: '页面不存在。' });
    return;
  }

  const filePath = resolve(rootDirectory, `.${normalizedUrlPath}`);
  const rootWithSeparator = rootDirectory.endsWith(sep) ? rootDirectory : `${rootDirectory}${sep}`;
  const extension = extname(filePath).toLowerCase();

  if (!filePath.startsWith(rootWithSeparator) || !publicExtensions.has(extension)) {
    sendJson(response, 404, { error: '页面不存在。' });
    return;
  }

  try {
    if (!statSync(filePath).isFile()) throw new Error('Not a file');
    const content = readFileSync(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extension],
      'Cache-Control': ['.html', '.css', '.js'].includes(extension) ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: '页面不存在。' });
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (await handleAdminApi(request, response, url)) return;
    if (await handleApi(request, response, url.pathname)) return;

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: '不支持该请求方法。' });
      return;
    }

    serveStaticFile(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: '服务器内部错误。' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`TeiKyo website: http://127.0.0.1:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
