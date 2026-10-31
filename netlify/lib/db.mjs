import { neon } from '@neondatabase/serverless';

// External Neon PostgreSQL is compatible with Netlify Free: no Netlify
// Database auto-provisioning or credit-based account entitlement required.
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS products (\n  id TEXT PRIMARY KEY,\n  sku TEXT NOT NULL UNIQUE,\n  title TEXT NOT NULL,\n  category TEXT NOT NULL DEFAULT '',\n  description TEXT NOT NULL DEFAULT '',\n  price BIGINT NOT NULL DEFAULT 0 CHECK (price >= 0),\n  cost BIGINT NOT NULL DEFAULT 0 CHECK (cost >= 0),\n  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),\n  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready')),\n  image_key TEXT NOT NULL DEFAULT '',\n  image_url TEXT NOT NULL DEFAULT '',\n  variants_json TEXT NOT NULL DEFAULT '[]',\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n)",
  "CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updated_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)",
  "CREATE TABLE IF NOT EXISTS activity (\n  id TEXT PRIMARY KEY,\n  product_id TEXT,\n  action TEXT NOT NULL,\n  detail TEXT NOT NULL DEFAULT '',\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n)",
  "CREATE INDEX IF NOT EXISTS idx_activity_time ON activity(created_at DESC)",
  "CREATE TABLE IF NOT EXISTS login_attempts (\n  ip_hash TEXT PRIMARY KEY,\n  failed_count INTEGER NOT NULL,\n  window_start BIGINT NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS marketplace_connections (\n  provider TEXT PRIMARY KEY,\n  token_cipher TEXT NOT NULL,\n  shops_json TEXT NOT NULL DEFAULT '[]',\n  status TEXT NOT NULL DEFAULT 'connected',\n  checked_at TIMESTAMPTZ,\n  last_sync_at TIMESTAMPTZ,\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n)",
  "CREATE TABLE IF NOT EXISTS marketplace_snapshots (\n  provider TEXT NOT NULL,\n  shop_id TEXT NOT NULL,\n  products_json TEXT NOT NULL DEFAULT '[]',\n  product_count INTEGER,\n  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  PRIMARY KEY (provider, shop_id)\n)"
];
let client = null;
let activeUrl = '';
let initialized = null;

async function ensureSchema(sql) {
  for (const statement of SCHEMA) {
    await sql.query(statement, []);
  }
}
export function getDatabase() {
  const connectionString = process.env.DATABASE_URL || '';
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    throw new Error('DATABASE_URL sozlanmagan. Neon PostgreSQL ulanish manzilini Netlify Environment variables bo‘limiga kiriting');
  }
  if (client === null || connectionString !== activeUrl) {
    client = neon(connectionString);
    activeUrl = connectionString;
    initialized = null;
  }
  const sql = client;
  return {
    sql: {
      unsafe: async (query, params = []) => {
        if (!initialized) {
          initialized = ensureSchema(sql).catch(error => {
            initialized = null;
            throw error;
          });
        }
        await initialized;
        return sql.query(query, params);
      }
    }
  };
}
