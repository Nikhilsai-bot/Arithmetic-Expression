const USE_POSTGRES = Boolean(process.env.DATABASE_URL);

let impl;

if (USE_POSTGRES) {
  // ---------- Postgres (Neon/Supabase/etc.) ----------
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  impl = {
    async initDb() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS history (
          id SERIAL PRIMARY KEY,
          expression TEXT NOT NULL,
          tokens TEXT NOT NULL DEFAULT '[]',
          postfix TEXT NOT NULL,
          result DOUBLE PRECISION NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      // Backfill for any table created before the tokens column existed.
      await pool.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS tokens TEXT NOT NULL DEFAULT '[]'`);
    },
    async insertHistory(expression, tokens, postfix, result) {
      await pool.query(
        "INSERT INTO history (expression, tokens, postfix, result) VALUES ($1, $2, $3, $4)",
        [expression, JSON.stringify(tokens), JSON.stringify(postfix), result]
      );
    },
    async getHistory(limit = 20) {
      const { rows } = await pool.query(
        "SELECT id, expression, tokens, postfix, result, created_at FROM history ORDER BY id DESC LIMIT $1",
        [limit]
      );
      return rows.map((row) => ({ ...row, tokens: JSON.parse(row.tokens), postfix: JSON.parse(row.postfix) }));
    },
    async clearHistory() {
      await pool.query("DELETE FROM history");
    },
  };
} else {
  // ---------- SQLite (local dev, zero setup) ----------
  const Database = require("better-sqlite3");
  const path = require("path");
  const db = new Database(path.join(__dirname, "history.db"));

  impl = {
    async initDb() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          expression TEXT NOT NULL,
          tokens TEXT NOT NULL DEFAULT '[]',
          postfix TEXT NOT NULL,
          result REAL NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      // Backfill for any table created before the tokens column existed.
      const cols = db.prepare("PRAGMA table_info(history)").all().map((c) => c.name);
      if (!cols.includes("tokens")) {
        db.exec("ALTER TABLE history ADD COLUMN tokens TEXT NOT NULL DEFAULT '[]'");
      }
    },
    async insertHistory(expression, tokens, postfix, result) {
      // Store a full ISO-8601 UTC timestamp (with the "Z" suffix) so that
      // `new Date(created_at)` on the frontend is parsed as UTC and
      // correctly converted to the viewer's local time zone.
      db.prepare(
        "INSERT INTO history (expression, tokens, postfix, result, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(expression, JSON.stringify(tokens), JSON.stringify(postfix), result, new Date().toISOString());
    },
    async getHistory(limit = 20) {
      const rows = db
        .prepare(
          "SELECT id, expression, tokens, postfix, result, created_at FROM history ORDER BY id DESC LIMIT ?"
        )
        .all(limit);
      return rows.map((row) => ({ ...row, tokens: JSON.parse(row.tokens), postfix: JSON.parse(row.postfix) }));
    },
    async clearHistory() {
      db.exec("DELETE FROM history");
    },
  };
}

module.exports = {
  backend: USE_POSTGRES ? "postgres" : "sqlite",
  initDb: impl.initDb,
  insertHistory: impl.insertHistory,
  getHistory: impl.getHistory,
  clearHistory: impl.clearHistory,
};
