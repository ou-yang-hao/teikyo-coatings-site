-- 网站基础配置：适合保存品牌名、联系方式和首页文案等单值数据。
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 首页核心数字，position 控制前端显示顺序。
CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

-- 产品平台。
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  category_label TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'mint',
  image_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '',
  applications TEXT NOT NULL DEFAULT '',
  substrates TEXT NOT NULL DEFAULT '',
  performance TEXT NOT NULL DEFAULT '',
  process TEXT NOT NULL DEFAULT '',
  package_info TEXT NOT NULL DEFAULT '',
  document_url TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 行业解决方案。
CREATE TABLE IF NOT EXISTS solutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 新闻与技术文章；首页最多展示一条精选内容和若干普通内容。
CREATE TABLE IF NOT EXISTS insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  read_time TEXT NOT NULL DEFAULT '',
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 前端询盘表单提交后写入此表。
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_type TEXT NOT NULL DEFAULT 'general' CHECK (inquiry_type IN ('general', 'product_reservation')),
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_code TEXT NOT NULL DEFAULT '',
  product_title TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  application TEXT NOT NULL DEFAULT '',
  quantity TEXT NOT NULL DEFAULT '',
  desired_date TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  internal_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 后台用户：角色分为管理员、编辑和只读查看者。
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

-- 登录令牌只保存 SHA-256 摘要，浏览器中的原始令牌通过 HttpOnly Cookie 传递。
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 记录后台关键操作，便于管理员追踪谁在何时修改了哪些数据。
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_position ON products(is_published, position);
CREATE INDEX IF NOT EXISTS idx_solutions_position ON solutions(is_published, position);
CREATE INDEX IF NOT EXISTS idx_insights_published_at ON insights(is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
