import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PASSWORD_KEY_LENGTH = 64;

// 使用 scrypt 对密码进行慢哈希；数据库只保存 salt 和 hash，不保存明文密码。
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  try {
    const actual = Buffer.from(scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex'), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12) return '密码至少需要 12 个字符。';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return '密码必须包含大写字母、小写字母和数字。';
  }
  return '';
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
