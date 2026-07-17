import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = join(projectRoot, 'dist');
const configuredBasePath = process.env.PAGES_BASE_PATH || '/teikyo-coatings-site/';
const basePath = `/${configuredBasePath.replace(/^\/+|\/+$/g, '')}/`;

// 只发布访客需要的公开文件，后台、数据库和内部文档不会进入 Pages 制品。
const publicFiles = [
  'index.html', 'about.html', 'capabilities.html', 'contact.html', 'insights.html',
  'legal.html', 'privacy.html', 'product.html', 'products.html', 'reservation.html',
  'solutions.html', 'script.js', 'site-shell.js', 'stitch.css', 'styles.css',
];

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
cpSync(join(projectRoot, 'assets'), join(outputDirectory, 'assets'), { recursive: true });

function rewritePublicPaths(content, filename) {
  let rewritten = content
    .replaceAll('href="/', `href="${basePath}`)
    .replaceAll('src="/', `src="${basePath}`)
    .replaceAll("url('/", `url('${basePath}`);

  if (filename === 'script.js') {
    rewritten = rewritten.replace("fetch('/api/content'", `fetch('${basePath}content.json'`);
  }
  return rewritten;
}

for (const filename of publicFiles) {
  const source = readFileSync(join(projectRoot, filename), 'utf8');
  writeFileSync(join(outputDirectory, basename(filename)), rewritePublicPaths(source, filename), 'utf8');
}

// 使用 seed.sql 构建只读内容快照，确保静态演示与新数据库的默认内容一致。
const database = new DatabaseSync(':memory:');
database.exec(readFileSync(join(projectRoot, 'database', 'schema.sql'), 'utf8'));
database.exec(readFileSync(join(projectRoot, 'database', 'seed.sql'), 'utf8'));

const settings = Object.fromEntries(database.prepare('SELECT key, value FROM settings').all().map(({ key, value }) => [key, value]));
const stats = database.prepare('SELECT id, value, label, position FROM stats ORDER BY position, id').all();
const products = database.prepare(`
  SELECT id, category, category_label, code, title, summary, theme, image_url,
         description, features, applications, substrates, performance, process,
         package_info, document_url, position
  FROM products WHERE is_published = 1 ORDER BY position, id
`).all().map((product) => ({
  ...product,
  image_url: product.image_url.startsWith('/') ? `${basePath}${product.image_url.slice(1)}` : product.image_url,
  document_url: product.document_url.startsWith('/') ? `${basePath}${product.document_url.slice(1)}` : product.document_url,
}));
const solutions = database.prepare('SELECT id, title, summary, position FROM solutions WHERE is_published = 1 ORDER BY position, id').all();
const insights = database.prepare('SELECT id, type, title, summary, published_at, read_time, is_featured FROM insights WHERE is_published = 1 ORDER BY is_featured DESC, published_at DESC, id DESC').all();
database.close();

writeFileSync(join(outputDirectory, 'content.json'), JSON.stringify({ settings, stats, products, solutions, insights }), 'utf8');
writeFileSync(join(outputDirectory, '.nojekyll'), '', 'utf8');
console.log(`GitHub Pages 静态站点已生成：${resolve(outputDirectory)}`);
