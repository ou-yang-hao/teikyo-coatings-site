import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { initializeAdminSchema } from '../lib/admin.js';
import { hashPassword, validatePassword } from '../lib/auth.js';

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const databasePath = join(rootDirectory, 'data', 'site.sqlite');
const args = process.argv.slice(2);

function option(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const username = option('--username', 'admin').trim();
const displayName = option('--display-name', '系统管理员').trim();
const role = option('--role', 'admin').trim();
const generatedPassword = `${randomBytes(12).toString('base64url')}Aa1`;
const password = args.includes('--generate') ? generatedPassword : option('--password');
const mustChangePassword = args.includes('--force-change') ? 1 : 0;

if (!username || !displayName || !['admin', 'editor', 'viewer'].includes(role)) {
  throw new Error('请提供有效的 --username、--display-name 和 --role。');
}

const passwordError = validatePassword(password);
if (passwordError) throw new Error(`${passwordError} 可使用 --generate 自动生成密码。`);

mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON;');
database.exec(readFileSync(join(rootDirectory, 'database', 'schema.sql'), 'utf8'));
initializeAdminSchema(database);

const credentials = hashPassword(password);
const existing = database.prepare('SELECT id FROM users WHERE username = ?').get(username);

if (existing) {
  database.prepare(`
    UPDATE users
    SET display_name = ?, password_hash = ?, password_salt = ?, role = ?, is_active = 1,
        must_change_password = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(displayName, credentials.hash, credentials.salt, role, mustChangePassword, existing.id);
  database.prepare('DELETE FROM admin_sessions WHERE user_id = ?').run(existing.id);
  console.log(`已更新后台用户：${username}`);
} else {
  database.prepare(`
    INSERT INTO users (username, display_name, password_hash, password_salt, role, must_change_password)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(username, displayName, credentials.hash, credentials.salt, role, mustChangePassword);
  console.log(`已创建后台用户：${username}`);
}

console.log(`角色：${role}`);
console.log(`初始密码：${password}`);
console.log(`首次登录修改密码：${mustChangePassword ? '是' : '否'}`);
database.close();
