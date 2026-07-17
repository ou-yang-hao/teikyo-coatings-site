import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const argumentsList = process.argv.slice(2);
const sourceIndex = argumentsList.indexOf('--source');
const sourceDirectory = resolve(projectRoot, sourceIndex >= 0 ? argumentsList[sourceIndex + 1] : 'imports/data');
const isDryRun = argumentsList.includes('--dry-run');
const shouldReplace = argumentsList.includes('--replace');

if (!isDryRun && !shouldReplace) {
  console.error('请使用 --dry-run 只校验数据，或使用 --replace 确认替换网站内容。');
  process.exit(1);
}

// 轻量 CSV 解析器：支持 UTF-8、逗号、双引号、双引号转义和单元格内换行。
function parseCsv(content, filename) {
  const text = content.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (insideQuotes) {
      if (character === '"' && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        insideQuotes = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      insideQuotes = true;
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n') {
      row.push(field.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }

  if (insideQuotes) throw new Error(`${filename} 存在未闭合的双引号。`);
  row.push(field.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  if (rows.length < 2) throw new Error(`${filename} 没有可导入的数据行。`);

  const headers = rows[0].map((header) => header.trim());
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length) throw new Error(`${filename} 存在重复列名：${duplicateHeaders.join('、')}`);

  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(`${filename} 第 ${rowIndex + 2} 行有 ${values.length} 列，应为 ${headers.length} 列。`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function readCsv(filename, requiredHeaders) {
  const path = join(sourceDirectory, filename);
  if (!existsSync(path)) throw new Error(`缺少文件：${path}`);
  const records = parseCsv(readFileSync(path, 'utf8'), filename);
  const actualHeaders = Object.keys(records[0]);
  const missingHeaders = requiredHeaders.filter((header) => !actualHeaders.includes(header));
  if (missingHeaders.length) throw new Error(`${filename} 缺少列：${missingHeaders.join('、')}`);
  return records;
}

function requireText(record, field, filename, rowNumber) {
  const value = record[field]?.trim();
  if (!value) throw new Error(`${filename} 第 ${rowNumber} 行的 ${field} 不能为空。`);
  return value;
}

function parsePosition(value, filename, rowNumber) {
  const position = Number(value);
  if (!Number.isInteger(position) || position < 0) {
    throw new Error(`${filename} 第 ${rowNumber} 行的 position 必须是非负整数。`);
  }
  return position;
}

function parseBoolean(value, filename, rowNumber) {
  if (['1', 'true', 'yes'].includes(value.toLowerCase())) return 1;
  if (['0', 'false', 'no'].includes(value.toLowerCase())) return 0;
  throw new Error(`${filename} 第 ${rowNumber} 行的布尔值必须是 1/0、true/false 或 yes/no。`);
}

function assertUnique(records, field, filename) {
  const seen = new Set();
  records.forEach((record, index) => {
    const value = record[field];
    if (seen.has(value)) throw new Error(`${filename} 第 ${index + 2} 行的 ${field} 重复：${value}`);
    seen.add(value);
  });
}

// 规范站内图片路径，并在用户省略扩展名时尝试匹配实际图片文件。
function normalizeImageUrl(value, filename, rowNumber) {
  const originalValue = value?.trim();
  if (!originalValue) return '';
  if (/^https?:\/\//i.test(originalValue)) return originalValue;

  let urlPath = originalValue.replaceAll('\\', '/');
  if (urlPath.startsWith('new/')) urlPath = urlPath.slice(4);
  if (!urlPath.startsWith('/')) urlPath = `/${urlPath}`;

  const diskPath = join(projectRoot, urlPath.slice(1));
  if (existsSync(diskPath)) return urlPath;

  for (const extension of ['.webp', '.jpg', '.jpeg', '.png']) {
    if (existsSync(`${diskPath}${extension}`)) return `${urlPath}${extension}`;
  }

  throw new Error(`${filename} 第 ${rowNumber} 行的图片不存在：${originalValue}`);
}

function loadAndValidateData() {
  const settings = readCsv('settings.csv', ['key', 'value']).map((record, index) => ({
    key: requireText(record, 'key', 'settings.csv', index + 2),
    value: requireText(record, 'value', 'settings.csv', index + 2).replaceAll('\\n', '\n'),
  }));

  const stats = readCsv('stats.csv', ['value', 'label', 'position']).map((record, index) => ({
    value: requireText(record, 'value', 'stats.csv', index + 2),
    label: requireText(record, 'label', 'stats.csv', index + 2),
    position: parsePosition(record.position, 'stats.csv', index + 2),
  }));

  const products = readCsv('products.csv', [
    'category', 'category_label', 'code', 'title', 'summary', 'theme', 'image_url',
    'description', 'features', 'applications', 'substrates', 'performance', 'process',
    'package_info', 'document_url', 'position', 'is_published',
  ]).map((record, index) => ({
    category: requireText(record, 'category', 'products.csv', index + 2),
    categoryLabel: requireText(record, 'category_label', 'products.csv', index + 2),
    code: requireText(record, 'code', 'products.csv', index + 2),
    title: requireText(record, 'title', 'products.csv', index + 2),
    summary: requireText(record, 'summary', 'products.csv', index + 2),
    theme: requireText(record, 'theme', 'products.csv', index + 2),
    imageUrl: normalizeImageUrl(record.image_url, 'products.csv', index + 2),
    description: record.description?.trim() || '',
    features: record.features?.trim() || '',
    applications: record.applications?.trim() || '',
    substrates: record.substrates?.trim() || '',
    performance: record.performance?.trim() || '',
    process: record.process?.trim() || '',
    packageInfo: record.package_info?.trim() || '',
    documentUrl: record.document_url?.trim() || '',
    position: parsePosition(record.position, 'products.csv', index + 2),
    isPublished: parseBoolean(record.is_published, 'products.csv', index + 2),
  }));

  const solutions = readCsv('solutions.csv', ['title', 'summary', 'position', 'is_published']).map((record, index) => ({
    title: requireText(record, 'title', 'solutions.csv', index + 2),
    summary: requireText(record, 'summary', 'solutions.csv', index + 2),
    position: parsePosition(record.position, 'solutions.csv', index + 2),
    isPublished: parseBoolean(record.is_published, 'solutions.csv', index + 2),
  }));

  const insights = readCsv('insights.csv', ['type', 'title', 'summary', 'published_at', 'read_time', 'is_featured', 'is_published']).map((record, index) => {
    const publishedAt = requireText(record, 'published_at', 'insights.csv', index + 2);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
      throw new Error(`insights.csv 第 ${index + 2} 行的 published_at 必须是 YYYY-MM-DD。`);
    }
    return {
      type: requireText(record, 'type', 'insights.csv', index + 2),
      title: requireText(record, 'title', 'insights.csv', index + 2),
      summary: record.summary?.trim() || '',
      publishedAt,
      readTime: record.read_time?.trim() || '',
      isFeatured: parseBoolean(record.is_featured, 'insights.csv', index + 2),
      isPublished: parseBoolean(record.is_published, 'insights.csv', index + 2),
    };
  });

  assertUnique(settings, 'key', 'settings.csv');
  assertUnique(products, 'code', 'products.csv');
  if (insights.filter((insight) => insight.isFeatured && insight.isPublished).length > 1) {
    throw new Error('insights.csv 最多只能有一条已发布内容设置为精选（is_featured=1）。');
  }

  return { settings, stats, products, solutions, insights };
}

function printSummary(data) {
  console.log(`数据目录：${sourceDirectory}`);
  console.table([
    { file: 'settings.csv', records: data.settings.length },
    { file: 'stats.csv', records: data.stats.length },
    { file: 'products.csv', records: data.products.length },
    { file: 'solutions.csv', records: data.solutions.length },
    { file: 'insights.csv', records: data.insights.length },
  ]);
}

function replaceDatabaseContent(data) {
  const dataDirectory = join(projectRoot, 'data');
  mkdirSync(dataDirectory, { recursive: true });
  const database = new DatabaseSync(join(dataDirectory, 'site.sqlite'));
  database.exec(readFileSync(join(projectRoot, 'database', 'schema.sql'), 'utf8'));

  // 旧数据库通过 ALTER TABLE 增加图片字段，新数据库则直接使用 schema.sql。
  const productColumns = database.prepare('PRAGMA table_info(products)').all();
  const productMigrations = ['image_url', 'description', 'features', 'applications', 'substrates', 'performance', 'process', 'package_info', 'document_url'];
  productMigrations.forEach((columnName) => {
    if (!productColumns.some((column) => column.name === columnName)) {
      database.exec(`ALTER TABLE products ADD COLUMN ${columnName} TEXT NOT NULL DEFAULT '';`);
    }
  });

  const statements = {
    setting: database.prepare('INSERT INTO settings (key, value) VALUES (?, ?)'),
    stat: database.prepare('INSERT INTO stats (value, label, position) VALUES (?, ?, ?)'),
    product: database.prepare(`
      INSERT INTO products (
        category, category_label, code, title, summary, theme, image_url, description,
        features, applications, substrates, performance, process, package_info,
        document_url, position, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    solution: database.prepare('INSERT INTO solutions (title, summary, position, is_published) VALUES (?, ?, ?, ?)'),
    insight: database.prepare(`
      INSERT INTO insights (type, title, summary, published_at, read_time, is_featured, is_published)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
  };

  database.exec('BEGIN IMMEDIATE;');
  try {
    // 仅替换网站内容，保留 inquiries 表中的历史询盘。
    database.exec('DELETE FROM insights; DELETE FROM solutions; DELETE FROM products; DELETE FROM stats; DELETE FROM settings;');
    data.settings.forEach((item) => statements.setting.run(item.key, item.value));
    data.stats.forEach((item) => statements.stat.run(item.value, item.label, item.position));
    data.products.forEach((item) => statements.product.run(
      item.category, item.categoryLabel, item.code, item.title, item.summary, item.theme,
      item.imageUrl, item.description, item.features, item.applications, item.substrates,
      item.performance, item.process, item.packageInfo, item.documentUrl, item.position,
      item.isPublished,
    ));
    data.solutions.forEach((item) => statements.solution.run(item.title, item.summary, item.position, item.isPublished));
    data.insights.forEach((item) => statements.insight.run(item.type, item.title, item.summary, item.publishedAt, item.readTime, item.isFeatured, item.isPublished));
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  } finally {
    database.close();
  }
}

try {
  const data = loadAndValidateData();
  printSummary(data);

  if (isDryRun) {
    console.log('校验通过：未写入数据库。');
  } else {
    replaceDatabaseContent(data);
    console.log(`导入完成：${basename(sourceDirectory)} 已替换网站内容，历史询盘已保留。`);
  }
} catch (error) {
  console.error(`导入失败：${error.message}`);
  process.exit(1);
}
