CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost INTEGER NOT NULL DEFAULT 0 CHECK (cost >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready')),
  image_key TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  variants_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity(created_at DESC);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
